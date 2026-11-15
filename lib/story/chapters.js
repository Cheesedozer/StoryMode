/**
 * Chapters
 *
 * A chapter is a stretch of play that advances one or more arc stages and
 * holds one or more scenes. Chapters own the arc stages; scenes say which
 * chapter they belong to.
 *
 * Blueprint data:
 *   chapters:   [{ index, title, summary?, advances: ["spine:preparation", "romance:deepening"] }]
 *   scene_plan: [{ ..., chapter: 0 }]
 *
 * Blueprints without chapters get one chapter per scene, built from the
 * scene's own arc_stages (step 3 blueprints) or from its pacing phase (older
 * ones). That synthesis happens on read and is never written back.
 *
 * This module has no SillyTavern imports.
 *
 * @module story/chapters
 */

import { getShape, getStage, getStageForSlot } from './shapes.js';
import { getBlueprintArcs, parseArcStageRef } from './arcs.js';
import { normalizePhase, PHASES } from '../core/phases.js';

// ============================================================================
// READ
// ============================================================================

/** Resolve a reference to a real arc and stage of this blueprint. */
function resolveRef(ref, arcs) {
    const parsed = parseArcStageRef(ref);
    if (!parsed) return null;
    const arc = arcs.find(a => a.id === parsed.arc)
        || arcs.find(a => a.shape === parsed.arc)
        || (parsed.arc === 'main' ? arcs[0] : null);
    const stage = arc && getStage(arc.shape, parsed.stage);
    return arc && stage ? { arc: arc.id, stage: stage.id } : null;
}

function resolveRefs(list, arcs) {
    const seen = new Set();
    return (Array.isArray(list) ? list : [])
        .map(r => resolveRef(r, arcs))
        .filter(r => r && !seen.has(`${r.arc}:${r.stage}`) && seen.add(`${r.arc}:${r.stage}`));
}

/** Spine stage implied by a scene's pacing phase and its position among scenes of that phase. */
function spineStageFromPhase(scenes, sceneIndex, arcs) {
    const phase = normalizePhase(scenes[sceneIndex]?.phase, PHASES[0]);
    const samePhase = scenes.map((s, i) => [normalizePhase(s.phase, PHASES[0]), i]).filter(([p]) => p === phase).map(([, i]) => i);
    const fraction = samePhase.length ? samePhase.indexOf(sceneIndex) / samePhase.length : 0;
    return getStageForSlot(arcs[0].shape, phase, fraction);
}

/** Whether the blueprint carries its own chapter list. */
export function hasChapters(blueprint) {
    return Array.isArray(blueprint?.chapters) && blueprint.chapters.length > 0;
}

/**
 * The scene → chapter mapping. Scenes without a chapter number inherit the
 * previous scene's; numbers never go backwards.
 * @returns {Array<number>} chapter index per scene
 */
function sceneChapterMap(blueprint) {
    const scenes = blueprint?.scene_plan || [];
    if (!hasChapters(blueprint)) return scenes.map((_, i) => i);
    const last = blueprint.chapters.length - 1;
    let current = 0;
    return scenes.map(scene => {
        const n = parseInt(scene?.chapter, 10);
        if (Number.isInteger(n) && n >= current) current = Math.min(n, last);
        return current;
    });
}

/**
 * Chapters with resolved stage references and their scenes.
 * @param {Object} blueprint
 * @returns {Array<{index: number, title: string, summary: string, advances: Array<{arc, stage}>, scenes: Array<number>, synthesized: boolean}>}
 */
export function getChapters(blueprint) {
    const scenes = blueprint?.scene_plan || [];
    const arcs = getBlueprintArcs(blueprint);
    const map = sceneChapterMap(blueprint);

    const chapters = hasChapters(blueprint)
        ? blueprint.chapters.map((c, i) => ({
            index: i,
            title: c?.title || `Chapter ${i + 1}`,
            summary: c?.summary || '',
            advances: resolveRefs(c?.advances, arcs),
            scenes: [],
            synthesized: false,
        }))
        : scenes.map((scene, i) => ({
            index: i,
            title: scene?.title || `Chapter ${i + 1}`,
            summary: '',
            advances: resolveRefs(scene?.arc_stages, arcs),
            scenes: [],
            synthesized: true,
        }));

    map.forEach((chapterIndex, sceneIndex) => chapters[chapterIndex]?.scenes.push(sceneIndex));

    // Every chapter with scenes moves the spine; derive the stage when it is missing
    for (const chapter of chapters) {
        if (chapter.advances.some(r => r.arc === 'spine') || !chapter.scenes.length) continue;
        const stage = spineStageFromPhase(scenes, chapter.scenes[0], arcs);
        if (stage) chapter.advances.unshift({ arc: 'spine', stage: stage.id });
    }
    return chapters;
}

/** @returns {number} The chapter a scene belongs to */
export function getChapterIndexForScene(blueprint, sceneIndex) {
    const map = sceneChapterMap(blueprint);
    return map[Math.max(0, Math.min(sceneIndex, map.length - 1))] ?? 0;
}

/**
 * Where each arc stands at a scene, and whether the scene's chapter advances it.
 * @param {Object} blueprint
 * @param {number} sceneIndex
 * @returns {Array<{arc: Object, shape: Object, stage: Object|null, activeHere: boolean}>}
 */
export function getArcStatesAtScene(blueprint, sceneIndex) {
    const arcs = getBlueprintArcs(blueprint);
    const chapters = getChapters(blueprint);
    const current = getChapterIndexForScene(blueprint, sceneIndex);
    const latest = new Map();
    for (const chapter of chapters.slice(0, current + 1)) {
        chapter.advances.forEach(r => latest.set(r.arc, r.stage));
    }
    const here = chapters[current]?.advances || [];
    return arcs.map(arc => {
        const shape = getShape(arc.shape);
        const stageId = latest.get(arc.id);
        return { arc, shape, stage: stageId ? getStage(shape, stageId) : null, activeHere: here.some(r => r.arc === arc.id) };
    }).filter(x => x.shape);
}

/**
 * Arc stages reached by a scene, as "arc:stage" keys (for conditions).
 * @returns {Set<string>}
 */
export function getReachedStages(blueprint, sceneIndex) {
    const current = getChapterIndexForScene(blueprint, sceneIndex);
    const reached = new Set();
    for (const chapter of getChapters(blueprint).slice(0, current + 1)) {
        chapter.advances.forEach(r => reached.add(`${r.arc}:${r.stage}`));
    }
    return reached;
}

// ============================================================================
// GENERATION: normalization and coordination rules
// ============================================================================

/**
 * Clean a generated or imported blueprint's chapters in place: stage
 * references resolved to "arc:stage", scene chapter numbers made valid.
 * Blueprints without chapters are left without them (read synthesizes).
 * @param {Object} blueprint
 */
export function normalizeChapters(blueprint) {
    if (!blueprint) return;
    const arcs = getBlueprintArcs(blueprint);
    if (!hasChapters(blueprint)) {
        delete blueprint.chapters;
        for (const scene of blueprint.scene_plan || []) {
            if (Array.isArray(scene.arc_stages)) {
                scene.arc_stages = resolveRefs(scene.arc_stages, arcs).map(r => `${r.arc}:${r.stage}`);
            } else {
                delete scene.arc_stages;
            }
        }
        return;
    }
    blueprint.chapters = blueprint.chapters.map((c, i) => {
        const clean = {
            index: i,
            title: String(c?.title || `Chapter ${i + 1}`).trim(),
            advances: resolveRefs(c?.advances, arcs).map(r => `${r.arc}:${r.stage}`),
        };
        if (c?.summary) clean.summary = String(c.summary).trim();
        return clean;
    });
    const map = sceneChapterMap(blueprint);
    (blueprint.scene_plan || []).forEach((scene, i) => {
        scene.chapter = map[i];
        delete scene.arc_stages;
    });
}

function climaxStageIds(arc) {
    return new Set(getShape(arc.shape).stages.filter(s => s.slot === 'climax').map(s => s.id));
}

/** Whether an "arc:stage" key is this arc's climax-slot stage. */
function isClimaxKey(key, arc, ids) {
    const [arcId, stageId] = String(key).split(':');
    return arcId === arc.id && ids.has(stageId);
}

function climaxChapterOf(blueprint, arc) {
    const ids = climaxStageIds(arc);
    let found = -1;
    blueprint.chapters.forEach((c, i) => {
        if ((c.advances || []).some(k => isClimaxKey(k, arc, ids))) found = i;
    });
    return found;
}

function moveThreadClimax(blueprint, arc, from, to) {
    const ids = climaxStageIds(arc);
    const key = blueprint.chapters[from].advances.find(k => isClimaxKey(k, arc, ids));
    if (!key) return;
    blueprint.chapters[from].advances = blueprint.chapters[from].advances.filter(k => k !== key);
    blueprint.chapters[to].advances = [...new Set([...blueprint.chapters[to].advances, key])];
}

/**
 * Enforce the blending rules on a generated blueprint's chapters:
 *  1. The spine's climax comes last: a thread's climax lands in an earlier
 *     chapter or converges in the same chapter.
 *  2. At most one thread reaches its climax per chapter.
 * Violations are repaired by moving the thread's climax stage. Call after
 * normalizeChapters.
 * @param {Object} blueprint - Mutated in place
 * @returns {Array<string>} What was changed, for logging
 */
export function enforceArcConvergence(blueprint) {
    const changes = [];
    const arcs = getBlueprintArcs(blueprint);
    if (arcs.length < 2 || !hasChapters(blueprint)) return changes;

    const spineClimax = climaxChapterOf(blueprint, arcs[0]);
    if (spineClimax < 0) return changes;

    for (const thread of arcs.slice(1)) {
        const at = climaxChapterOf(blueprint, thread);
        if (at > spineClimax) {
            moveThreadClimax(blueprint, thread, at, spineClimax);
            changes.push(`${thread.id} climax moved from chapter ${at + 1} to converge with the spine in chapter ${spineClimax + 1}`);
        }
    }

    const taken = new Set();
    for (const thread of arcs.slice(1)) {
        const at = climaxChapterOf(blueprint, thread);
        if (at < 0) continue;
        if (!taken.has(at)) {
            taken.add(at);
            continue;
        }
        let target = at - 1;
        while (target >= 0 && taken.has(target)) target--;
        if (target < 0) continue;
        moveThreadClimax(blueprint, thread, at, target);
        taken.add(target);
        changes.push(`${thread.id} climax moved from chapter ${at + 1} to chapter ${target + 1} so only one thread peaks per chapter`);
    }
    return changes;
}

/**
 * Resolve a stage reference ("spine:execution", "heist.execution") to this
 * blueprint's "arc:stage" key.
 * @returns {string|null}
 */
export function resolveStageKey(blueprint, ref) {
    const r = resolveRef(ref, getBlueprintArcs(blueprint));
    return r ? `${r.arc}:${r.stage}` : null;
}

/**
 * Give a blueprint real chapters when it has none (one per scene, from the
 * scenes' own arc_stages or phases), so generation can apply the
 * coordination rules. No-op when chapters exist.
 * @param {Object} blueprint - Mutated in place
 */
export function materializeChapters(blueprint) {
    if (!blueprint?.scene_plan?.length || hasChapters(blueprint)) return;
    const chapters = getChapters(blueprint);
    blueprint.chapters = chapters.map(c => ({
        index: c.index,
        title: c.title,
        advances: c.advances.map(r => `${r.arc}:${r.stage}`),
    }));
    blueprint.scene_plan.forEach((scene, i) => {
        scene.chapter = i;
        delete scene.arc_stages;
    });
}
