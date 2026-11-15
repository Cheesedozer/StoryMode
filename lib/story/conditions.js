/**
 * Conditions
 *
 * Small, structured conditions over story state, used by tentpole triggers,
 * complications and endings. The runtime never interprets prose: it checks
 * ledger tags, arc stages reached, and the chapter.
 *
 *   {
 *     tags_all:  ["a", "b"],        // every tag present
 *     tags_any:  ["c", "d"],        // at least one present
 *     tags_none: ["e"],             // none present
 *     stage:     "spine:execution", // this arc stage reached
 *     chapter_min: 2                // at or after this chapter (0-based)
 *   }
 *
 * An empty condition always holds. Specificity counts how much a condition
 * asks for, so the most specific match can win (salience selection).
 *
 * This module has no SillyTavern imports.
 *
 * @module story/conditions
 */

/** Same normalization the ledger uses for tags. */
export const toTag = t => String(t || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const tagList = v => [...new Set((Array.isArray(v) ? v : (v ? [v] : [])).map(toTag).filter(Boolean))];

/**
 * Clean a condition object.
 * @param {Object} raw
 * @param {Function} [resolveStage] - (ref) => "arc:stage" | null
 * @returns {Object} Normalized condition (possibly empty)
 */
export function normalizeCondition(raw, resolveStage = null) {
    if (!raw || typeof raw !== 'object') return {};
    const cond = {};
    for (const key of ['tags_all', 'tags_any', 'tags_none']) {
        const list = tagList(raw[key]);
        if (list.length) cond[key] = list;
    }
    if (raw.stage) {
        const stage = resolveStage ? resolveStage(raw.stage) : String(raw.stage).trim().toLowerCase();
        if (stage) cond.stage = stage;
    }
    const chapter = parseInt(raw.chapter_min ?? raw.chapter, 10);
    if (Number.isInteger(chapter) && chapter >= 0) cond.chapter_min = chapter;
    return cond;
}

/**
 * @param {Object} cond - Normalized condition
 * @param {{tags: Set<string>, reached: Set<string>, chapter: number}} ctx
 * @returns {boolean}
 */
export function conditionHolds(cond, ctx) {
    if (!cond) return true;
    const has = t => ctx.tags.has(t);
    if (cond.tags_all && !cond.tags_all.every(has)) return false;
    if (cond.tags_any && !cond.tags_any.some(has)) return false;
    if (cond.tags_none && cond.tags_none.some(has)) return false;
    if (cond.stage && !ctx.reached.has(cond.stage)) return false;
    if (cond.chapter_min !== undefined && ctx.chapter < cond.chapter_min) return false;
    return true;
}

/** How much a condition asks for; more specific matches win. */
export function conditionSpecificity(cond) {
    if (!cond) return 0;
    return (cond.tags_all?.length || 0)
        + (cond.tags_any ? 1 : 0)
        + (cond.tags_none?.length || 0) * 0.5
        + (cond.stage ? 1 : 0)
        + (cond.chapter_min !== undefined ? 0.5 : 0);
}

/**
 * Among items whose condition holds, the most specific one (first on ties).
 * @param {Array<Object>} items
 * @param {Function} getCondition - item => condition
 * @param {Object} ctx
 * @returns {Object|null}
 */
export function pickMostSalient(items, getCondition, ctx) {
    let best = null;
    let bestScore = -1;
    for (const item of items) {
        const cond = getCondition(item);
        if (!conditionHolds(cond, ctx)) continue;
        const score = conditionSpecificity(cond);
        if (score > bestScore) {
            best = item;
            bestScore = score;
        }
    }
    return best;
}

/**
 * Score an ending's reached_if against the story so far. Violated tags_none
 * or missing tags_all rule it out (-Infinity); otherwise matched tags count.
 * @param {Object} cond - Normalized reached_if
 * @param {{tags: Set<string>}} ctx
 * @returns {number}
 */
export function scoreEnding(cond, ctx) {
    if (!cond) return 0;
    const has = t => ctx.tags.has(t);
    if (cond.tags_none?.some(has)) return -Infinity;
    if (cond.tags_all && !cond.tags_all.every(has)) return -Infinity;
    return (cond.tags_all?.length || 0) * 2 + (cond.tags_any?.filter(has).length || 0);
}

/**
 * Every tag a set of conditions and choice points mentions, so the tracker
 * can prefer them when recording what happened.
 * @param {Object} blueprint
 * @returns {Array<string>}
 */
export function collectTagVocabulary(blueprint) {
    const tags = new Set();
    const addCond = c => ['tags_all', 'tags_any', 'tags_none'].forEach(k => tagList(c?.[k]).forEach(t => tags.add(t)));
    for (const scene of blueprint?.scene_plan || []) {
        for (const cp of scene.choice_points || []) tagList(cp?.tags).forEach(t => tags.add(t));
    }
    (blueprint?.complications || []).forEach(c => addCond(c.when));
    (blueprint?.tentpoles || []).forEach(t => addCond(t.trigger));
    [blueprint?.primary_ending, ...(blueprint?.alternate_endings || [])].forEach(e => addCond(e?.reached_if));
    return [...tags];
}

/**
 * Tags worth suggesting to the tracker right now: the current scene's
 * choice tags first, then the rest of the vocabulary, capped.
 * @param {Object} blueprint
 * @param {number} sceneIndex
 * @param {number} [limit=24]
 * @returns {Array<string>}
 */
export function getTagHints(blueprint, sceneIndex, limit = 24) {
    const sceneTags = (blueprint?.scene_plan?.[sceneIndex]?.choice_points || []).flatMap(cp => tagList(cp?.tags));
    return [...new Set([...sceneTags, ...collectTagVocabulary(blueprint)])].slice(0, limit);
}

/**
 * Split "#tag" tokens out of a note: "Ana lied to the guard #lied_to_guard".
 * @param {string} value
 * @returns {{text: string, tags: Array<string>}}
 */
export function splitNoteTags(value) {
    const tags = [];
    const text = String(value || '').replace(/(^|\s)#([a-z0-9_]+)/gi, (_, space, tag) => {
        tags.push(toTag(tag));
        return space;
    }).replace(/\s+/g, ' ').trim();
    return { text, tags: [...new Set(tags.filter(Boolean))] };
}
