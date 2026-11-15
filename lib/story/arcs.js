/**
 * Story Arcs at runtime
 *
 * Resolves which arcs (one spine, up to two threads) a chat is playing, where
 * each one stands, and builds the <arcs> prompt block.
 *
 *  - Story Mode: the chat's chosen shapes (chatState.storyShape and
 *    chatState.threadShapes), else the story type's defaults. Every arc's
 *    stage follows the round counter through the shared pacing slots, so
 *    thread climaxes converge with the spine's.
 *  - Scenario Mode: the blueprint's arcs. A scene lists the stages it
 *    advances (scene.arc_stages); an arc's current stage is the latest one
 *    reached at or before the current scene.
 *
 * @module story/arcs
 */

import {
    getShape,
    getStage,
    getStageForSlot,
    normalizeArcs,
    normalizeShapeId,
    getDefaultArcsForStoryType,
    MAX_THREADS,
} from './shapes.js';
import { normalizePhase, PHASES } from '../core/phases.js';

const escapeAttr = s => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// ============================================================================
// STORY MODE
// ============================================================================

/**
 * Arcs for a Story Mode chat.
 * @param {Object} chatState - Per-chat state
 * @param {Object|null} storyType - The chat's story type
 * @returns {Array<Object>} Normalized arcs, spine first
 */
export function getStoryModeArcs(chatState, storyType) {
    const defaults = getDefaultArcsForStoryType(storyType);
    const spineShape = normalizeShapeId(chatState?.storyShape) || defaults[0]?.shape || 'escalation';
    const threads = Array.isArray(chatState?.threadShapes)
        ? chatState.threadShapes.map(normalizeShapeId).filter(Boolean)
        : defaults.slice(1).map(a => a.shape);
    return normalizeArcs([
        { role: 'spine', shape: spineShape },
        ...threads.slice(0, MAX_THREADS).map(shape => ({ role: 'thread', shape })),
    ]);
}

/**
 * Each arc's stage at a point in a Story Mode arc.
 * @param {Array<Object>} arcs
 * @param {string} phase - Current pacing phase
 * @param {number} percentInPhase - 0..100
 * @returns {Array<{arc: Object, shape: Object, stage: Object}>}
 */
export function getStagesForPhase(arcs, phase, percentInPhase) {
    const fraction = Math.max(0, Math.min(100, Number(percentInPhase) || 0)) / 100;
    return arcs.map(arc => {
        const shape = getShape(arc.shape);
        return { arc, shape, stage: getStageForSlot(shape, phase, fraction) };
    }).filter(x => x.shape && x.stage);
}

// ============================================================================
// SCENARIO MODE (blueprints)
// ============================================================================

/**
 * Parse one arc-stage reference: "spine:preparation", "spine.preparation",
 * or { arc, stage }.
 * @returns {{arc: string, stage: string}|null}
 */
export function parseArcStageRef(ref) {
    if (!ref) return null;
    if (typeof ref === 'object') {
        return ref.arc && ref.stage ? { arc: String(ref.arc).trim().toLowerCase(), stage: String(ref.stage).trim().toLowerCase() } : null;
    }
    const m = String(ref).trim().toLowerCase().match(/^([a-z0-9_]+)\s*[:.]\s*([a-z0-9_ ]+)$/);
    return m ? { arc: m[1], stage: m[2].trim().replace(/\s+/g, '_') } : null;
}

/**
 * The blueprint's arcs, or a migrated Escalation spine for v1 blueprints.
 * @param {Object} blueprint
 * @returns {Array<Object>}
 */
export function getBlueprintArcs(blueprint) {
    const arcs = normalizeArcs(blueprint?.arcs);
    return arcs.length ? arcs : [{ id: 'spine', role: 'spine', shape: 'escalation' }];
}

/**
 * Stages a scene advances, validated against the blueprint's arcs. A scene
 * without usable references gets the spine stage implied by its phase and
 * position among the scenes of that phase.
 * @param {Object} blueprint
 * @param {number} sceneIndex
 * @param {Array<Object>} [arcs]
 * @returns {Array<{arc: string, stage: string}>}
 */
export function getSceneArcStages(blueprint, sceneIndex, arcs = getBlueprintArcs(blueprint)) {
    const scenes = blueprint?.scene_plan || [];
    const scene = scenes[sceneIndex];
    if (!scene) return [];

    const refs = (Array.isArray(scene.arc_stages) ? scene.arc_stages : [])
        .map(parseArcStageRef)
        .filter(Boolean)
        .map(ref => {
            const arc = arcs.find(a => a.id === ref.arc);
            const stage = arc && getStage(arc.shape, ref.stage);
            return arc && stage ? { arc: arc.id, stage: stage.id } : null;
        })
        .filter(Boolean);

    if (refs.some(r => r.arc === 'spine')) return refs;

    // Derive the spine stage from the scene's pacing phase
    const phase = normalizePhase(scene.phase, PHASES[0]);
    const samePhase = scenes.map((s, i) => [normalizePhase(s.phase, PHASES[0]), i]).filter(([p]) => p === phase).map(([, i]) => i);
    const position = samePhase.indexOf(sceneIndex);
    const fraction = samePhase.length > 0 ? position / samePhase.length : 0;
    const stage = getStageForSlot(arcs[0].shape, phase, fraction);
    return stage ? [{ arc: 'spine', stage: stage.id }, ...refs] : refs;
}

/**
 * Where each arc stands at a scene, and whether the scene itself advances it.
 * @param {Object} blueprint
 * @param {number} sceneIndex
 * @returns {Array<{arc: Object, shape: Object, stage: Object|null, activeHere: boolean}>}
 */
export function getArcStatesAtScene(blueprint, sceneIndex) {
    const arcs = getBlueprintArcs(blueprint);
    const latest = new Map();
    let here = [];
    for (let i = 0; i <= sceneIndex; i++) {
        const refs = getSceneArcStages(blueprint, i, arcs);
        refs.forEach(r => latest.set(r.arc, r.stage));
        if (i === sceneIndex) here = refs;
    }
    return arcs.map(arc => {
        const shape = getShape(arc.shape);
        const stageId = latest.get(arc.id);
        return {
            arc,
            shape,
            stage: stageId ? getStage(shape, stageId) : null,
            activeHere: here.some(r => r.arc === arc.id),
        };
    }).filter(x => x.shape);
}

// ============================================================================
// PROMPT
// ============================================================================

function arcLine({ arc, shape, stage }, { full }) {
    const label = arc.role === 'spine' ? 'spine' : 'thread';
    const question = arc.question ? ` question="${escapeAttr(arc.question)}"` : '';
    if (!stage) {
        return `  <arc role="${label}" shape="${escapeAttr(shape.name)}"${question} stage="not started"/>`;
    }
    const attrs = `role="${label}" shape="${escapeAttr(shape.name)}"${question} stage="${escapeAttr(stage.name)}"`;
    if (!full) return `  <arc ${attrs}/>`;
    const note = arc.stage_notes?.[stage.id];
    const guidance = note ? `${stage.guidance} In this story: ${note}` : stage.guidance;
    return `  <arc ${attrs}>${guidance}</arc>`;
}

/**
 * Build the <arcs> block.
 * @param {Array<{arc, shape, stage, activeHere?}>} states - Spine first
 * @returns {string} XML, or '' when there is nothing to say
 */
export function buildArcsXml(states) {
    if (!states?.length) return '';
    const hasThreads = states.some(s => s.arc.role === 'thread');
    const lines = states.map(s => arcLine(s, {
        // Threads not advanced in this scene stay one line, to save tokens
        full: s.arc.role === 'spine' || s.activeHere !== false,
    }));
    const note = hasThreads
        ? 'The spine carries the main question and decides the ending. Threads run alongside it; weave them in where they fit, and let each reach its own crisis before or together with the spine\'s.'
        : 'The shape of the story: where it stands now and what this stage asks for.';
    return `<arcs note="${escapeAttr(note)}">\n${lines.join('\n')}\n</arcs>`;
}

/**
 * Label for the current pacing phase under a shape (e.g. "turn" for
 * kishōtenketsu's climax slot).
 */
export function getPhaseLabel(shapeId, phase) {
    const shape = getShape(shapeId);
    if (phase === 'climax' && shape && !shape.conflict) return shape.climaxLabel;
    return phase;
}

// ============================================================================
// GENERATION: normalization and coordination rules
// ============================================================================

/**
 * Clean scene.arc_stages on every scene to "arc:stage" strings that name a
 * real arc and stage. Unknown references are dropped.
 * @param {Object} blueprint - Mutated in place
 */
export function normalizeSceneArcStages(blueprint) {
    const arcs = getBlueprintArcs(blueprint);
    for (const scene of blueprint?.scene_plan || []) {
        if (!Array.isArray(scene.arc_stages)) {
            delete scene.arc_stages;
            continue;
        }
        const seen = new Set();
        scene.arc_stages = scene.arc_stages
            .map(parseArcStageRef)
            .filter(Boolean)
            .map(ref => {
                const arc = arcs.find(a => a.id === ref.arc)
                    || arcs.find(a => a.shape === ref.arc)
                    || (ref.arc === 'main' ? arcs[0] : null);
                const stage = arc && getStage(arc.shape, ref.stage);
                return arc && stage ? `${arc.id}:${stage.id}` : null;
            })
            .filter(key => key && !seen.has(key) && seen.add(key));
    }
}

function climaxSceneOf(blueprint, arcs, arcId) {
    const arc = arcs.find(a => a.id === arcId);
    const climaxStages = new Set(getShape(arc.shape).stages.filter(s => s.slot === 'climax').map(s => s.id));
    let found = -1;
    (blueprint.scene_plan || []).forEach((_, i) => {
        if (getSceneArcStages(blueprint, i, arcs).some(r => r.arc === arcId && climaxStages.has(r.stage))) found = i;
    });
    return found;
}

function moveThreadClimax(blueprint, arcs, arcId, from, to) {
    const arc = arcs.find(a => a.id === arcId);
    const climaxStages = new Set(getShape(arc.shape).stages.filter(s => s.slot === 'climax').map(s => s.id));
    const scenes = blueprint.scene_plan;
    const stage = getSceneArcStages(blueprint, from, arcs).find(r => r.arc === arcId && climaxStages.has(r.stage))?.stage;
    if (!stage) return;
    scenes[from].arc_stages = (scenes[from].arc_stages || []).filter(k => k !== `${arcId}:${stage}`);
    scenes[to].arc_stages = [...new Set([...(scenes[to].arc_stages || []), `${arcId}:${stage}`])];
}

/**
 * Enforce the blending rules on a generated blueprint:
 *  1. The spine's climax comes last: a thread's climax lands before it or
 *     converges in the same scene.
 *  2. At most one thread reaches its climax per scene.
 * Violations are repaired by moving the thread's climax reference.
 * @param {Object} blueprint - Mutated in place
 * @returns {Array<string>} What was changed, for logging
 */
export function enforceArcConvergence(blueprint) {
    const changes = [];
    const arcs = getBlueprintArcs(blueprint);
    const scenes = blueprint?.scene_plan || [];
    if (arcs.length < 2 || !scenes.length) return changes;

    const spineClimax = climaxSceneOf(blueprint, arcs, 'spine');
    if (spineClimax < 0) return changes;

    // Rule 1: no thread climax after the spine's
    for (const thread of arcs.slice(1)) {
        const at = climaxSceneOf(blueprint, arcs, thread.id);
        if (at > spineClimax) {
            moveThreadClimax(blueprint, arcs, thread.id, at, spineClimax);
            changes.push(`${thread.id} climax moved from scene ${at + 1} to converge with the spine in scene ${spineClimax + 1}`);
        }
    }

    // Rule 2: one thread climax per scene; move extras to the nearest earlier free scene
    const taken = new Map();
    for (const thread of arcs.slice(1)) {
        const at = climaxSceneOf(blueprint, arcs, thread.id);
        if (at < 0) continue;
        if (!taken.has(at)) {
            taken.set(at, thread.id);
            continue;
        }
        let target = at - 1;
        while (target >= 0 && taken.has(target)) target--;
        if (target < 0) continue;
        moveThreadClimax(blueprint, arcs, thread.id, at, target);
        taken.set(target, thread.id);
        changes.push(`${thread.id} climax moved from scene ${at + 1} to scene ${target + 1} so only one thread peaks per scene`);
    }
    return changes;
}

/**
 * Prompt text describing the arcs for blueprint generation: shapes, stage
 * ids per pacing slot, and the coordination rules.
 * @param {Array<Object>} arcs - Normalized arcs (from the request or Phase 1)
 * @returns {string}
 */
export function describeArcsForGeneration(arcs) {
    return arcs.map(arc => {
        const shape = getShape(arc.shape);
        const stages = shape.stages.map(s => {
            const note = arc.stage_notes?.[s.id] ? ` In this story: ${arc.stage_notes[s.id]}` : '';
            return `    - \`${arc.id}:${s.id}\` (${s.slot}): ${s.name}. ${s.guidance}${note}`;
        }).join('\n');
        const question = arc.question ? ` Question: ${arc.question}` : '';
        const role = arc.role === 'spine' ? 'Spine (carries the main question and decides the ending)' : 'Thread (runs alongside the spine)';
        return `- **${arc.id}**: ${shape.name}. ${role}.${question}\n  ${shape.summary}\n${stages}`;
    }).join('\n');
}

/** The spine's climax, described for scene design. */
export function describeSpineClimax(arcs) {
    const shape = getShape(arcs[0]?.shape) || getShape('escalation');
    const climax = shape.stages.filter(s => s.slot === 'climax').map(s => s.name.toLowerCase()).join(' / ');
    return shape.conflict
        ? `The climax scene contains the spine's ${climax} and its immediate aftermath.`
        : `The climax scene holds the spine's ${climax}: a moment, carried by the people in it, that changes how everything before it reads or is felt.`;
}

/**
 * Arcs requested for generation: the chosen spine shape (or the story
 * type's default) and threads (the explicit choice, or the story type's
 * suggestions when the request carries no arcs at all).
 * @param {Array<Object>} requested - request.arcs
 * @param {Object} storyType
 * @returns {Array<Object>}
 */
export function resolveRequestArcs(requested, storyType) {
    const defaults = getDefaultArcsForStoryType(storyType);
    if (!Array.isArray(requested) || !requested.length) return defaults;
    const spine = requested.find(a => a?.role === 'spine') || requested[0];
    const threads = requested.filter(a => a !== spine && normalizeShapeId(a?.shape));
    return normalizeArcs([
        { role: 'spine', shape: normalizeShapeId(spine?.shape) || defaults[0].shape },
        ...threads.map(t => ({ role: 'thread', shape: t.shape })),
    ]);
}

/**
 * Merge Phase 1's arcs (questions, stage notes) onto the requested arcs.
 * The requested shapes and roles always win; the model only fills in what
 * each arc asks and how its stages play out in this story.
 * @param {Array<Object>} requested - Resolved requested arcs
 * @param {Array<Object>} generated - Phase 1 output
 * @returns {Array<Object>}
 */
export function mergeGeneratedArcs(requested, generated) {
    const gen = Array.isArray(generated) ? generated : [];
    const used = new Set();
    return requested.map((arc, i) => {
        const match = gen.findIndex((g, j) => !used.has(j) && normalizeShapeId(g?.shape) === arc.shape && (g.role || (j === 0 ? 'spine' : 'thread')) === arc.role);
        const pick = match >= 0 ? match : (gen[i] && !used.has(i) ? i : -1);
        if (pick < 0) return arc;
        used.add(pick);
        const merged = normalizeArcs([{ ...gen[pick], role: 'spine', shape: arc.shape }])[0];
        return { ...arc, ...(merged.question ? { question: merged.question } : {}), ...(merged.stage_notes ? { stage_notes: merged.stage_notes } : {}) };
    });
}
