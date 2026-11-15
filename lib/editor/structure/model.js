/**
 * Structure editor: data operations
 *
 * Pure functions over a blueprint object (mutated in place) for the arcs,
 * chapters, tentpoles, complications, ending conditions and choice tags.
 * No DOM and no SillyTavern imports, so both editors and tests can use them.
 *
 * @module editor/structure/model
 */

import { getShape, normalizeArcs, MAX_THREADS } from '../../story/shapes.js';
import { getBlueprintArcs } from '../../story/arcs.js';
import {
    getChapters,
    hasChapters,
    normalizeChapters,
    materializeChapters,
    enforceArcConvergence,
    getChapterIndexForScene,
} from '../../story/chapters.js';
import { normalizeCondition, collectTagVocabulary, toTag } from '../../story/conditions.js';
import { listEndings } from '../../story/story-events.js';

// ============================================================================
// PATHS
// ============================================================================

export function getPath(obj, path) {
    return String(path).split('.').reduce((cur, key) => (cur == null ? undefined : cur[key]), obj);
}

export function setPath(obj, path, value) {
    const keys = String(path).split('.');
    let cur = obj;
    keys.slice(0, -1).forEach((key, i) => {
        if (cur[key] == null || typeof cur[key] !== 'object') cur[key] = /^\d+$/.test(keys[i + 1]) ? [] : {};
        cur = cur[key];
    });
    const last = keys[keys.length - 1];
    if (value === undefined) delete cur[last];
    else cur[last] = value;
}

/** Comma-separated text to a tag list. */
export const parseTags = text => [...new Set(String(text || '').split(',').map(toTag).filter(Boolean))];

/** One-item-per-line text to a list. */
export const parseLines = text => String(text || '').split('\n').map(s => s.trim()).filter(Boolean);

// ============================================================================
// ARCS
// ============================================================================

/** Arcs to edit: the blueprint's own, or the implied Escalation spine. */
export function getEditableArcs(blueprint) {
    return getBlueprintArcs(blueprint);
}

/** Write the implied arcs so they can be edited. */
export function ensureArcs(blueprint) {
    if (!Array.isArray(blueprint.arcs) || !blueprint.arcs.length) {
        blueprint.arcs = getBlueprintArcs(blueprint).map(a => ({ ...a }));
    }
    return blueprint.arcs;
}

/** Every stage key an arc owns, e.g. "spine:preparation". */
function stageKeysOf(arc) {
    return (getShape(arc.shape)?.stages || []).map(s => `${arc.id}:${s.id}`);
}

/**
 * How many references to an arc's stages exist (chapters, tentpole
 * triggers, conditions), so the UI can warn before a change removes them.
 */
export function countStageReferences(blueprint, arcId) {
    const prefix = `${arcId}:`;
    let n = 0;
    (blueprint.chapters || []).forEach(c => (c.advances || []).forEach(k => { if (String(k).startsWith(prefix)) n++; }));
    (blueprint.scene_plan || []).forEach(s => (s.arc_stages || []).forEach(k => { if (String(k).startsWith(prefix)) n++; }));
    const conds = [
        ...(blueprint.tentpoles || []).map(t => t.trigger),
        ...(blueprint.complications || []).map(c => c.when),
        ...listEndings(blueprint).map(e => e.reached_if),
    ];
    conds.forEach(c => { if (c?.stage && String(c.stage).startsWith(prefix)) n++; });
    return n;
}

/** Drop stage references that no longer name a real arc stage. */
export function pruneStageReferences(blueprint) {
    const valid = new Set(getBlueprintArcs(blueprint).flatMap(stageKeysOf));
    (blueprint.chapters || []).forEach(c => { c.advances = (c.advances || []).filter(k => valid.has(k)); });
    (blueprint.scene_plan || []).forEach(s => {
        if (Array.isArray(s.arc_stages)) s.arc_stages = s.arc_stages.filter(k => valid.has(k));
    });
    const conds = [
        ...(blueprint.tentpoles || []).map(t => t.trigger),
        ...(blueprint.complications || []).map(c => c.when),
        ...listEndings(blueprint).map(e => e.reached_if),
    ];
    conds.forEach(c => { if (c?.stage && !valid.has(c.stage)) delete c.stage; });
    // A tentpole whose only trigger was a removed stage arrives at the start
    (blueprint.tentpoles || []).forEach(t => {
        if (!t.trigger || !Object.keys(t.trigger).length) t.trigger = { chapter_min: 0 };
    });
}

/** Change an arc's shape; its stage notes and stage references are cleared. */
export function setArcShape(blueprint, index, shapeId) {
    const arcs = ensureArcs(blueprint);
    const arc = arcs[index];
    if (!arc || !getShape(shapeId) || arc.shape === shapeId) return;
    arc.shape = shapeId;
    delete arc.stage_notes;
    blueprint.arcs = normalizeArcs(arcs);
    pruneStageReferences(blueprint);
}

export function addThread(blueprint, shapeId = 'romance') {
    const arcs = ensureArcs(blueprint);
    if (arcs.filter(a => a.role === 'thread').length >= MAX_THREADS) return false;
    arcs.push({ role: 'thread', shape: shapeId });
    blueprint.arcs = normalizeArcs(arcs);
    return true;
}

export function removeThread(blueprint, index) {
    const arcs = ensureArcs(blueprint);
    if (!arcs[index] || arcs[index].role !== 'thread') return;
    arcs.splice(index, 1);
    blueprint.arcs = normalizeArcs(arcs);
    pruneStageReferences(blueprint);
}

// ============================================================================
// CHAPTERS
// ============================================================================

/** Turn the implied one-chapter-per-scene layout into editable chapters. */
export function createChapters(blueprint) {
    materializeChapters(blueprint);
    normalizeChapters(blueprint);
}

export function addChapter(blueprint) {
    if (!hasChapters(blueprint)) createChapters(blueprint);
    blueprint.chapters.push({ index: blueprint.chapters.length, title: `Chapter ${blueprint.chapters.length + 1}`, advances: [] });
}

/**
 * Remove a chapter; its scenes and arc stages join the previous chapter (or
 * the next one, for the first chapter).
 */
export function removeChapter(blueprint, index) {
    if (!hasChapters(blueprint) || blueprint.chapters.length <= 1) return;
    const target = index > 0 ? index - 1 : 0;
    // The chapter's stages move with its scenes
    const removed = blueprint.chapters[index];
    const receiver = blueprint.chapters[index > 0 ? index - 1 : 1];
    const merged = new Set([...(receiver.advances || []), ...(removed.advances || [])]);
    const order = getBlueprintArcs(blueprint).flatMap(stageKeysOf);
    receiver.advances = order.filter(k => merged.has(k));
    blueprint.chapters.splice(index, 1);
    (blueprint.scene_plan || []).forEach(scene => {
        if (scene.chapter === index) scene.chapter = target;
        else if (scene.chapter > index) scene.chapter -= 1;
    });
    blueprint.chapters.forEach((c, i) => { c.index = i; });
}

/** Swap a chapter with its neighbour (-1 up, +1 down); scenes follow. */
export function moveChapter(blueprint, index, delta) {
    const to = index + delta;
    if (!hasChapters(blueprint) || to < 0 || to >= blueprint.chapters.length) return;
    const chapters = blueprint.chapters;
    [chapters[index], chapters[to]] = [chapters[to], chapters[index]];
    chapters.forEach((c, i) => { c.index = i; });
    (blueprint.scene_plan || []).forEach(scene => {
        if (scene.chapter === index) scene.chapter = to;
        else if (scene.chapter === to) scene.chapter = index;
    });
}

export function setSceneChapter(blueprint, sceneIndex, chapterIndex) {
    if (!hasChapters(blueprint)) createChapters(blueprint);
    const scene = blueprint.scene_plan?.[sceneIndex];
    if (scene) scene.chapter = Math.max(0, Math.min(chapterIndex, blueprint.chapters.length - 1));
}

export function toggleAdvance(blueprint, chapterIndex, key, on) {
    if (!hasChapters(blueprint)) createChapters(blueprint);
    const chapter = blueprint.chapters[chapterIndex];
    if (!chapter) return;
    const set = new Set(chapter.advances || []);
    if (on) set.add(key); else set.delete(key);
    // Keep the arc's stage order
    const order = getBlueprintArcs(blueprint).flatMap(stageKeysOf);
    chapter.advances = order.filter(k => set.has(k));
}

/**
 * Problems with the current arcs and chapters, without changing anything.
 * @returns {Array<string>}
 */
export function checkStructure(blueprint) {
    const problems = [];
    const chapters = getChapters(blueprint);
    const scenes = blueprint.scene_plan || [];

    chapters.forEach(c => {
        if (!c.synthesized && !c.scenes.length) problems.push(`Chapter ${c.index + 1} ("${c.title}") has no scenes.`);
    });
    if (hasChapters(blueprint)) {
        // Scenes should run through chapters in order
        let last = 0;
        scenes.forEach((s, i) => {
            const ch = getChapterIndexForScene(blueprint, i);
            if (Number.isInteger(s.chapter) && s.chapter < last) problems.push(`Scene ${i + 1} is in chapter ${s.chapter + 1} but comes after a scene in chapter ${last + 1}; it plays as part of chapter ${ch + 1}.`);
            last = Math.max(last, ch);
        });
        const copy = JSON.parse(JSON.stringify(blueprint));
        normalizeChapters(copy);
        enforceArcConvergence(copy).forEach(change => problems.push(`Arc rule: ${change.replace(/ moved from/, ' should move from')}.`));
    }
    return problems;
}

/** Apply the arc rules (thread climaxes before or with the spine's; one per chapter). */
export function fixArcConvergence(blueprint) {
    if (!hasChapters(blueprint)) return [];
    normalizeChapters(blueprint);
    return enforceArcConvergence(blueprint);
}

// ============================================================================
// TENTPOLES, COMPLICATIONS, ENDINGS
// ============================================================================

function nextId(list, base) {
    const used = new Set((list || []).map(x => x.id));
    let i = (list || []).length + 1;
    while (used.has(`${base}_${i}`)) i++;
    return `${base}_${i}`;
}

export function addTentpole(blueprint) {
    blueprint.tentpoles = blueprint.tentpoles || [];
    blueprint.tentpoles.push({
        id: nextId(blueprint.tentpoles, 'tentpole'),
        name: 'New tentpole',
        trigger: { chapter_min: 0 },
        situation: '',
        ways_to_meet: [],
        setup_hooks: [],
    });
}

export function addComplication(blueprint) {
    blueprint.complications = blueprint.complications || [];
    blueprint.complications.push({ id: nextId(blueprint.complications, 'complication'), name: 'New complication', when: {}, situation: '', once: true });
}

export function removeListItem(blueprint, listKey, index) {
    if (Array.isArray(blueprint[listKey])) blueprint[listKey].splice(index, 1);
}

/** Keep a condition object clean after an edit (empty keys removed). */
export function cleanCondition(blueprint, path) {
    const cond = getPath(blueprint, path);
    setPath(blueprint, path, normalizeCondition(cond || {}));
}

// ============================================================================
// LOOKUPS FOR THE UI
// ============================================================================

/** Stage options grouped by arc, for selects and checkboxes. */
export function getStageOptions(blueprint) {
    return getBlueprintArcs(blueprint).map(arc => {
        const shape = getShape(arc.shape);
        return {
            arc,
            shape,
            stages: shape.stages.map(s => ({ key: `${arc.id}:${s.id}`, id: s.id, name: s.name, slot: s.slot })),
        };
    });
}

/** Tags the story already uses, for suggestions. */
export function getVocabulary(blueprint) {
    return collectTagVocabulary(blueprint).sort();
}

/** Choice points that have no tags, so the story cannot remember them. */
export function countUntaggedChoices(blueprint) {
    return (blueprint.scene_plan || []).reduce((n, s) => n + (s.choice_points || []).filter(cp => !(cp.tags || []).length).length, 0);
}
