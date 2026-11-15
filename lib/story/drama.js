/**
 * Drama Manager
 *
 * A small rule engine over the blueprint's tentpoles, complications and
 * endings, driven by story state rather than prose:
 *
 *  - Tentpoles fire when their trigger holds (a chapter reached, an arc stage
 *    reached, or a tag condition). The situation is then injected as already
 *    in motion; how {{user}} meets it is open.
 *  - Complications are drawn when the story stalls: no beat, scene or ledger
 *    progress for N replies. Among the complications whose condition holds,
 *    the most specific wins (salience selection).
 *  - From the climax on, every ending's reached_if is scored against the
 *    ledger's tags. The best match is the ending lean; resolution guidance
 *    points toward it, and the lean freezes once the resolution begins.
 *
 * evaluateDrama() runs before each generation; recordReplyProgress() runs
 * after each tracked reply (inline markers or secondary tracker).
 *
 * @module story/drama
 */

import { extension_settings } from '/scripts/extensions.js';
import { name1 } from '/script.js';
import {
    MODULE_NAME,
    getChatStoryState,
    saveChatStoryState,
    getCurrentSceneIndex,
    getPacingMode,
} from '../core/state-manager.js';
import { getBlueprintState } from '../blueprint/storage.js';
import { getActiveLedgerEntries, getCompactableEntries, compactChapter } from './ledger.js';
import { generateSummaryWithPreset } from '../blueprint/summarization.js';
import { getChapterIndexForScene, getReachedStages } from './chapters.js';
import { conditionHolds, pickMostSalient, scoreEnding } from './conditions.js';
import { listEndings, isLateScene } from './story-events.js';
import { normalizePhase } from '../core/phases.js';

/** Replies an event stays in the prompt, unless the scene ends first. */
const EVENT_LIFETIME = { tentpole: 8, complication: 4 };

const escapeXml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = s => escapeXml(s).replace(/"/g, '&quot;');

// ============================================================================
// CONTEXT
// ============================================================================

function getActiveBlueprint() {
    const settings = extension_settings[MODULE_NAME] || {};
    if (getPacingMode() !== 'scenario') return null;
    if (!settings.blueprintSettings?.enabled || !settings.blueprintSettings?.useScenePrompts) return null;
    const { blueprint, useBlueprint } = getBlueprintState();
    return useBlueprint && blueprint?.scene_plan?.length ? blueprint : null;
}

function getComplicationSettings() {
    const c = extension_settings[MODULE_NAME]?.complications || {};
    return {
        enabled: c.enabled !== false,
        stallReplies: Number(c.stallReplies) > 0 ? Number(c.stallReplies) : 4,
    };
}

/** Tags on active ledger entries. */
export function getActiveTags() {
    const tags = new Set();
    getActiveLedgerEntries().forEach(e => (e.tags || []).forEach(t => tags.add(t)));
    return tags;
}

/**
 * State the conditions are checked against.
 * @returns {{tags: Set<string>, reached: Set<string>, chapter: number}}
 */
export function buildConditionContext(blueprint, sceneIndex) {
    return {
        tags: getActiveTags(),
        reached: getReachedStages(blueprint, sceneIndex),
        chapter: getChapterIndexForScene(blueprint, sceneIndex),
    };
}

/** Everything that counts as progress, as one comparable string. */
export function getProgressFingerprint() {
    const play = getChatStoryState().scenario;
    return `${play.currentSceneIndex}|${JSON.stringify(play.beatState || {})}|${getActiveLedgerEntries().length}`;
}

// ============================================================================
// AFTER EACH REPLY
// ============================================================================

/**
 * Update the stall counter and event lifetimes after a tracked reply. A
 * regenerated or swiped reply (same message as the last one counted) does
 * not count as another reply; it can still reset the stall by progressing.
 * @param {string} before - getProgressFingerprint() from before tracking
 * @param {number} [mesId] - Message index of the reply
 */
export async function recordReplyProgress(before, mesId) {
    if (!getActiveBlueprint()) return;
    const state = getChatStoryState();
    const play = state.scenario;
    const progressed = getProgressFingerprint() !== before;
    const reroll = mesId !== undefined && mesId === play.lastCountedMesId;

    if (progressed) {
        play.stall = 0;
    } else if (!reroll) {
        play.stall = (play.stall || 0) + 1;
    }
    const scene = getCurrentSceneIndex();
    play.activeEvents = (play.activeEvents || [])
        .map(e => ({ ...e, replies: (e.replies || 0) + (reroll ? 0 : 1) }))
        .filter(e => e.scene === scene && e.replies < (EVENT_LIFETIME[e.kind] || 4));
    if (mesId !== undefined) play.lastCountedMesId = mesId;

    await saveChatStoryState(state);
}

// ============================================================================
// BEFORE EACH GENERATION
// ============================================================================

function fireTentpole(play, blueprint, sceneIndex, ctx) {
    if ((play.activeEvents || []).some(e => e.kind === 'tentpole')) return false;
    const next = (blueprint.tentpoles || []).find(t => !play.firedTentpoles[t.id] && conditionHolds(t.trigger, ctx));
    if (!next) return false;
    play.firedTentpoles[next.id] = { scene: sceneIndex, chapter: ctx.chapter, at: Date.now() };
    play.activeEvents.push({ kind: 'tentpole', id: next.id, scene: sceneIndex, replies: 0 });
    console.log(`[Story Mode] Tentpole fired: ${next.name}`);
    return true;
}

function drawComplication(play, blueprint, sceneIndex, ctx) {
    const { enabled, stallReplies } = getComplicationSettings();
    if (!enabled || (play.stall || 0) < stallReplies) return false;
    if ((play.activeEvents || []).length) return false;
    const pool = (blueprint.complications || []).filter(c => !(c.once && play.usedComplications.includes(c.id)));
    const pick = pickMostSalient(pool, c => c.when, ctx);
    if (!pick) return false;
    play.usedComplications.push(pick.id);
    play.activeEvents.push({ kind: 'complication', id: pick.id, scene: sceneIndex, replies: 0 });
    play.stall = 0;
    console.log(`[Story Mode] Complication drawn after a stall: ${pick.name}`);
    return true;
}

/**
 * Score every ending against the ledger and pick the best; primary wins ties
 * and is the fallback when every other ending is ruled out.
 * @returns {{id: string, score: number}|null}
 */
export function computeEndingLean(blueprint, ctx) {
    const endings = listEndings(blueprint);
    if (!endings.length) return null;
    let best = { id: endings[0].id || 'primary', score: Math.max(0, scoreEnding(endings[0].reached_if, ctx)) };
    for (const ending of endings.slice(1)) {
        const score = scoreEnding(ending.reached_if, ctx);
        if (score > best.score) best = { id: ending.id, score };
    }
    return best;
}

function updateEndingLean(play, blueprint, sceneIndex, ctx) {
    const scene = blueprint.scene_plan[sceneIndex];
    if (!isLateScene(scene) && !scene?.is_ending_scene) return false;
    if (play.endingLean?.frozen) return false;
    const lean = computeEndingLean(blueprint, ctx);
    if (!lean) return false;
    const frozen = normalizePhase(scene?.phase) === 'resolution' || !!scene?.is_ending_scene;
    const changed = play.endingLean?.id !== lean.id || frozen;
    play.endingLean = { ...lean, frozen };
    return changed;
}

/**
 * Fire due tentpoles, draw a complication on a stall, update the ending lean.
 * Idempotent: safe to call before every generation, including swipes.
 * @returns {Promise<boolean>} Whether anything changed
 */
export async function evaluateDrama() {
    const blueprint = getActiveBlueprint();
    if (!blueprint) return false;
    const state = getChatStoryState();
    const play = state.scenario;
    const sceneIndex = getCurrentSceneIndex();
    const ctx = buildConditionContext(blueprint, sceneIndex);

    scheduleLedgerCompaction(ctx.chapter);

    let changed = fireTentpole(play, blueprint, sceneIndex, ctx);
    changed = drawComplication(play, blueprint, sceneIndex, ctx) || changed;
    changed = updateEndingLean(play, blueprint, sceneIndex, ctx) || changed;

    if (changed) await saveChatStoryState(state);
    return changed;
}

// ============================================================================
// LEDGER COMPACTION
// ============================================================================

const compacting = new Set();

function getCompactionSettings() {
    const l = extension_settings[MODULE_NAME]?.ledger || {};
    return { enabled: l.compactChapters !== false, minEntries: Number(l.compactMinEntries) > 0 ? Number(l.compactMinEntries) : 4 };
}

/**
 * Fold the ledger entries of finished chapters into one summary each, in the
 * background. Chapters with only a few entries are left as they are.
 * @param {number} currentChapter
 */
export function scheduleLedgerCompaction(currentChapter) {
    const { enabled, minEntries } = getCompactionSettings();
    if (!enabled) return;
    for (let chapter = 0; chapter < currentChapter; chapter++) {
        if (compacting.has(chapter) || getCompactableEntries(chapter).length < minEntries) continue;
        compacting.add(chapter);
        compactChapterNow(chapter)
            .catch(error => console.warn(`[Story Mode] Could not fold chapter ${chapter + 1} of the ledger:`, error))
            .finally(() => compacting.delete(chapter));
    }
}

async function compactChapterNow(chapter) {
    const entries = getCompactableEntries(chapter);
    const record = entries.map(e => `- [${e.type}] ${e.text}${e.who_knows?.length ? ` (known to: ${e.who_knows.join(', ')})` : ''}`).join('\n');
    const text = await generateSummaryWithPreset({
        systemPrompt: 'You condense a story\'s continuity record. Keep every choice, promise, secret, debt, relationship change and lasting change that later chapters may need, with the names of who did what and who knows it. Leave out anything already resolved and unimportant. Write 2-4 plain sentences in the past tense, and nothing else.',
        prompt: `Records from chapter ${chapter + 1}:\n${record}`,
        responseLength: 300,
    });
    const clean = String(text || '').trim();
    if (!clean) return;
    // The chat may have changed meanwhile; only fold what is still there
    if (getCompactableEntries(chapter).length) {
        await compactChapter(chapter, clean);
        console.log(`[Story Mode] Ledger: folded chapter ${chapter + 1} into a summary`);
        window.updateControllerPanel?.();
    }
}

// ============================================================================
// PROMPT
// ============================================================================

function findEvent(blueprint, event) {
    const list = event.kind === 'tentpole' ? blueprint.tentpoles : blueprint.complications;
    return (list || []).find(x => x.id === event.id) || null;
}

/**
 * <happening_now>: tentpoles and complications in motion.
 * @param {Object} blueprint
 * @returns {string} XML or ''
 */
export function buildHappeningNowXml(blueprint) {
    const play = getChatStoryState().scenario;
    const events = (play.activeEvents || [])
        .map(e => ({ e, data: findEvent(blueprint, e) }))
        .filter(x => x.data);
    if (!events.length) return '';

    const lines = events.map(({ e, data }) => {
        const timing = e.replies === 0
            ? 'Bring it in now, in this reply.'
            : 'It is under way. Keep its pressure on {{user}} until it has played out.';
        const ways = data.ways_to_meet?.length
            ? ` {{user}} might, for instance, ${data.ways_to_meet.join('; or ')}; whatever {{user}} does, follow it.`
            : '';
        return `  <event kind="${e.kind}" name="${escapeAttr(data.name)}">${escapeXml(data.situation)} ${timing}${escapeXml(ways)}</event>`;
    });

    return `<happening_now note="Already in motion: it arrives whatever {{user}} has done. How {{user}} meets it, and so how it turns out, is open.">
${lines.join('\n')}
</happening_now>`;
}

/** The ending the story leans toward, if one has been chosen. */
export function getLeanEnding(blueprint) {
    const lean = getChatStoryState().scenario?.endingLean;
    if (!lean) return null;
    return listEndings(blueprint).find(e => e.id === lean.id) || null;
}

/**
 * <ending_direction>, during the resolution only.
 * @param {Object} blueprint
 * @param {Object} scene - Current scene
 * @returns {string} XML or ''
 */
export function buildEndingDirectionXml(blueprint, scene) {
    if (normalizePhase(scene?.phase) !== 'resolution' && !scene?.is_ending_scene) return '';
    const ending = getLeanEnding(blueprint);
    if (!ending?.description) return '';
    return `<ending_direction note="Where {{user}}'s choices have taken the story. Let the resolution arrive there through events and their consequences.">
${escapeXml(ending.description)}
</ending_direction>`;
}

/**
 * Context for the epilogue: the active ledger and the ending the story
 * leaned toward (computed now if the climax never set one).
 * @returns {string} Prompt text, or '' when there is nothing to add
 */
export function buildEpilogueContext() {
    const parts = [];
    const entries = getActiveLedgerEntries();
    if (entries.length) {
        parts.push(`What the story established, including the protagonist's choices:\n${entries.slice(-40).map(e => `- ${e.text}`).join('\n')}`);
    }
    const blueprint = getActiveBlueprint();
    if (blueprint) {
        let ending = getLeanEnding(blueprint);
        if (!ending) {
            const lean = computeEndingLean(blueprint, buildConditionContext(blueprint, getCurrentSceneIndex()));
            ending = listEndings(blueprint).find(e => e.id === lean?.id) || null;
        }
        if (ending?.description) {
            parts.push(`The ending these choices led toward: ${ending.title ? `${ending.title}. ` : ''}${ending.description}\nWhere the transcript differs, follow the transcript.`);
        }
    }
    // This text goes into a direct request, where macros are not expanded
    return parts.join('\n\n').replace(/\{\{user\}\}/gi, name1 || 'the protagonist');
}

/** Names of the tentpoles and complications currently in motion. */
export function getActiveEventNames(blueprint) {
    const play = getChatStoryState().scenario;
    return (play?.activeEvents || []).map(e => findEvent(blueprint, e)?.name).filter(Boolean);
}
