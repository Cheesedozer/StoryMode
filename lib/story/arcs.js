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
 *  - Scenario Mode: the blueprint's arcs. Chapters declare the stages they
 *    advance (see story/chapters.js); an arc's current stage is the latest
 *    one reached at or before the current chapter.
 *
 * @module story/arcs
 */

import {
    getShape,
    getStageForSlot,
    normalizeArcs,
    normalizeShapeId,
    getDefaultArcsForStoryType,
    MAX_THREADS,
} from './shapes.js';

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
        // Threads not advanced in this chapter stay one line, to save tokens
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
