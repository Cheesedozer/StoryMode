/**
 * Story Arc Shapes
 *
 * A story arc is a group of chapters with a shape. A story has one spine arc
 * (the main question; it decides the ending) and up to two thread arcs
 * interleaved with it, each with its own shape. Character arcs are separate.
 *
 * Every shape names its own stages and maps each onto one of the four pacing
 * slots (setup / escalation / climax / resolution, see core/phases.js), so
 * pacing maths stays uniform while the narrator gets shape-specific guidance.
 *
 * Shapes without a driving conflict (kishōtenketsu, quiet) label the climax
 * slot "turn" or "resonance", and their guidance never asks for a
 * confrontation.
 *
 * This module has no SillyTavern imports, so the standalone editor can use it.
 *
 * @module story/shapes
 */

import { PHASES, normalizePhase } from '../core/phases.js';

export const MAX_THREADS = 2;

const S = (id, name, slot, guidance) => ({ id, name, slot, guidance });

/**
 * The catalogue. `conflict: false` marks shapes whose climax slot is not a
 * confrontation. `climaxLabel` names that slot in prompts and UI.
 */
export const SHAPES = [
    {
        id: 'escalation', name: 'Escalation', conflict: true, climaxLabel: 'climax',
        summary: 'A disturbance makes things steadily harder until a decisive confrontation.',
        stages: [
            S('disturbance', 'Disturbance', 'setup', 'Something breaks the normal order and the protagonist cannot ignore it. Make clear what they want now, why it matters, and who or what stands in the way.'),
            S('growing_difficulty', 'Growing difficulty', 'escalation', 'Each attempt costs something, reveals something, or creates a new problem. The opposition acts on its own plans, and choices already made, including {{user}}\'s, come back with consequences.'),
            S('turn', 'The turn', 'escalation', 'A reversal or revelation changes what the goal means or how it can be reached. Commitments harden; the easy ways out close.'),
            S('confrontation', 'Confrontation', 'climax', 'Bring the central conflict to its decisive confrontation. {{user}}\'s earlier choices shape how it plays out, and its outcome stands.'),
            S('aftermath', 'Aftermath', 'resolution', 'Show what changed and what it cost. Pay off what was planted and let a new normal settle.'),
        ],
    },
    {
        id: 'mystery', name: 'Mystery', conflict: true, climaxLabel: 'discovery',
        summary: 'A question drives inquiry; interpretations change until the truth is found.',
        stages: [
            S('question', 'The question', 'setup', 'Pose a specific question the protagonist has a reason to need answered. Plant fair clues among the ordinary details.'),
            S('inquiry', 'Inquiry', 'escalation', 'Clues come from people with their own reasons to help, hide, or mislead. Each answer opens a narrower question.'),
            S('changing_interpretations', 'Changing interpretations', 'escalation', 'New evidence overturns what seemed settled. Let the protagonist\'s working theory be wrong in a way that costs something, and let someone notice the inquiry and push back.'),
            S('discovery', 'Discovery', 'climax', 'The truth comes within reach, in a form the clues make fair. What the protagonist does with it, and who it hurts, is theirs to decide.'),
            S('consequences', 'Consequences', 'resolution', 'Show what knowing the truth changed: for the guilty, the innocent, and the one who found it.'),
        ],
    },
    {
        id: 'tournament', name: 'Tournament', conflict: true, climaxLabel: 'final contest',
        summary: 'A series of contests; strategies and relationships change until an outcome.',
        stages: [
            S('entry', 'Entry', 'setup', 'Establish the contest, its rules and stakes, why the protagonist is in it, and the rivals who matter.'),
            S('contests', 'Contests', 'escalation', 'Each contest tests something different and leaves a mark: an injury, a debt, a grudge, a new respect.'),
            S('changing_strategies', 'Changing strategies', 'escalation', 'What worked stops working. Alliances shift, rivals adapt, and the protagonist has to change how they compete or what they will give up to win.'),
            S('final_contest', 'The final contest', 'climax', 'The decisive contest, shaped by everything learned and owed along the way. Its result stands.'),
            S('outcome', 'Outcome', 'resolution', 'Show what winning or losing meant, and what the contest changed between the people in it.'),
        ],
    },
    {
        id: 'siege', name: 'Siege', conflict: true, climaxLabel: 'breaking point',
        summary: 'A threat to a fixed position; preparation, sustained pressure, then a breaking point.',
        stages: [
            S('threat', 'The threat', 'setup', 'Show the place worth holding and the threat coming for it. Make the defenders, their resources, and their weak points specific.'),
            S('preparations', 'Preparations', 'escalation', 'Time is short. Every preparation is a choice about what to protect and what to give up, and not everyone agrees.'),
            S('sustained_pressure', 'Sustained pressure', 'escalation', 'The pressure does not let up. Supplies, trust, and nerve wear down; small failures compound, and someone inside starts to crack.'),
            S('breaking_point', 'The breaking point', 'climax', 'Something gives: a wall, a person, a bargain. How the protagonist meets it decides whether the position holds, falls, or becomes something else.'),
            S('resolution', 'Resolution or transformation', 'resolution', 'Show what survived and what the siege made of the people who lived through it.'),
        ],
    },
    {
        id: 'journey', name: 'Journey', conflict: true, climaxLabel: 'last obstacle',
        summary: 'A departure, encounters on the way, and an arrival somewhere new.',
        stages: [
            S('departure', 'Departure', 'setup', 'Establish why the protagonist must leave, where they mean to go, and what they leave behind.'),
            S('encounters', 'Encounters', 'escalation', 'Each place and person on the road offers help at a price or trouble with a lesson in it.'),
            S('changing_circumstances', 'Changing circumstances', 'escalation', 'The road changes the traveller and the reason for travelling. The destination may stop being what it seemed.'),
            S('last_obstacle', 'The last obstacle', 'climax', 'The hardest crossing, made with what the journey has given and taken. How it goes is open.'),
            S('arrival', 'Arrival', 'resolution', 'Arrival somewhere, perhaps not where they set out for. Show who arrives, compared with who left.'),
        ],
    },
    {
        id: 'journey_return', name: 'Journey and return', conflict: true, climaxLabel: 'last obstacle',
        summary: 'A journey out and back; arriving home changed is the ending.',
        stages: [
            S('departure', 'Departure', 'setup', 'Establish home, why the protagonist must leave it, and what they expect to find out there.'),
            S('encounters', 'Encounters', 'escalation', 'The world beyond is stranger than home. Each encounter offers help at a price or trouble with a lesson in it.'),
            S('changing_circumstances', 'Changing circumstances', 'escalation', 'The protagonist adapts to the other world and starts to lose or find something of themselves in it.'),
            S('last_obstacle', 'The last obstacle', 'climax', 'The hardest crossing before the way home, made with what the journey has given and taken.'),
            S('return', 'Return', 'resolution', 'Home again, but changed. Show what they bring back and how home looks to the person they became.'),
        ],
    },
    {
        id: 'heist', name: 'Heist', conflict: true, climaxLabel: 'the moment it goes wrong',
        summary: 'An objective, preparation, execution full of reversals, then the aftermath.',
        stages: [
            S('objective', 'The objective', 'setup', 'Establish the prize, why it matters, why it is nearly impossible to take, and who the protagonist needs.'),
            S('preparation', 'Preparation', 'escalation', 'Recruit, scout, rehearse. Show the plan clearly enough that its failures will read later, and let the crew\'s frictions and secrets surface.'),
            S('execution', 'Execution', 'escalation', 'The plan meets reality. Complications arrive from the target, the crew, and outsiders; improvisation replaces the plan.'),
            S('goes_wrong', 'The moment it goes wrong', 'climax', 'The reversal the plan did not account for, often from inside. What the protagonist does now decides who gets out and with what.'),
            S('aftermath', 'Outcome and aftermath', 'resolution', 'Show the split, the cost, and who trusts whom now.'),
        ],
    },
    {
        id: 'episodic', name: 'Episodic', conflict: true, climaxLabel: 'payoff episode',
        summary: 'Complete episodes linked by cast, setting, or a recurring thread.',
        stages: [
            S('premise', 'The series premise', 'setup', 'Establish the cast, the place, and the kind of situation that keeps coming to them, plus one quiet thread that runs underneath.'),
            S('episodes', 'Episodes', 'escalation', 'Each episode is a complete situation with its own goal and resolution. Let small consequences carry from one to the next and the underlying thread advance a little each time.'),
            S('payoff', 'The payoff episode', 'climax', 'The episode where the underlying thread comes due and what earlier episodes set up pays off.'),
            S('rest', 'Rest', 'resolution', 'Let the cast settle. Show what the run of episodes changed between them.'),
        ],
    },
    {
        id: 'kishotenketsu', name: 'Kishōtenketsu', conflict: false, climaxLabel: 'turn',
        summary: 'Introduction, development, a turn that recontextualises, then connection.',
        stages: [
            S('introduction', 'Introduction', 'setup', 'Introduce the people and the situation with care and specific detail. Wants here can be small.'),
            S('development', 'Development', 'escalation', 'Deepen what was introduced: routines, relationships, textures. Let it grow at its own pace.'),
            S('turn', 'The turn', 'climax', 'Bring in something apparently unrelated, or a new angle, that makes everything before it read differently. Let it surprise and reframe.'),
            S('connection', 'Connection', 'resolution', 'Draw the turn and what came before together so the whole means more than its parts.'),
        ],
    },
    {
        id: 'tragedy', name: 'Tragedy', conflict: true, climaxLabel: 'the loss, risked',
        summary: 'A path toward serious loss and the conditions that lead to it. The loss is risked, not guaranteed.',
        stages: [
            S('path', 'The path', 'setup', 'Set the protagonist on a path that wants something worth wanting, with a flaw, a blind spot, or a bargain already in play.'),
            S('conditions', 'Contributing conditions', 'escalation', 'The conditions for loss accumulate: warnings dismissed, debts taken on, people pushed away. Each step has a reason that makes sense at the time, and a way back that grows costlier.'),
            S('loss', 'The loss, risked', 'climax', 'The serious loss is fully on the table. {{user}} can still avert it, at a real cost; whether they do is theirs.'),
            S('consequences', 'Consequences', 'resolution', 'Show what was lost or what saving it cost, and what the survivors understand now.'),
        ],
    },
    {
        id: 'quiet', name: 'Quiet or cumulative', conflict: false, climaxLabel: 'resonance',
        summary: 'Shared experiences and small developments that accumulate into resonance.',
        stages: [
            S('shared_experiences', 'Shared experiences', 'setup', 'Establish the people, the place, and the rhythm of their days. Wants are small or internal.'),
            S('observation', 'Observation', 'escalation', 'Linger on details and on how people notice each other. Small frictions and kindnesses accumulate.'),
            S('small_developments', 'Small developments', 'escalation', 'Something shifts slightly: a habit, a confidence, a closeness. Keep the stakes human-sized.'),
            S('resonance', 'Resonance', 'climax', 'A moment where what has accumulated is felt all at once, and moves the people who share it.'),
            S('rest', 'Rest', 'resolution', 'Let things settle into a slightly different rhythm, changed by what was shared.'),
        ],
    },
    {
        id: 'romance', name: 'Romance', conflict: true, climaxLabel: 'crisis',
        summary: 'Separate lives, attraction, deepening against obstacles, a crisis, then commitment or parting.',
        stages: [
            S('separate_lives', 'Separate lives', 'setup', 'Show each person\'s life and what is missing from it, and the wound or belief that makes love risky for them.'),
            S('meeting', 'Meeting and attraction', 'setup', 'They meet and something sparks, along with a reason this is inconvenient.'),
            S('deepening', 'Deepening against obstacles', 'escalation', 'Closeness grows through shared moments while outside obstacles and inner fears push back. Each step closer costs something.'),
            S('crisis', 'Retreat or crisis', 'climax', 'The fear or obstacle comes to a head and pulls them apart. Choosing each other now means facing it.'),
            S('commitment', 'Commitment or parting', 'resolution', 'They commit, changed, or part with what they learned. {{user}}\'s choices decide which.'),
        ],
    },
    {
        id: 'comedy_of_errors', name: 'Comedy of errors', conflict: true, climaxLabel: 'collision and revelation',
        summary: 'A misunderstanding compounds until everything collides and is revealed.',
        stages: [
            S('misunderstanding', 'The misunderstanding', 'setup', 'Plant a misunderstanding (an identity, a message, an assumption) that everyone has a reason to keep believing.'),
            S('complications', 'Compounding complications', 'escalation', 'Every attempt to fix it makes it worse. Lies need more lies; more people get pulled in with their own wrong ideas.'),
            S('collision', 'Collision and revelation', 'climax', 'Everyone ends up in the same place at the same time and the truth comes out at once.'),
            S('reconciliation', 'Reconciliation', 'resolution', 'Untangle the mess with good humour. Show who was forgiven and what was gained by the chaos.'),
        ],
    },
];

const BY_ID = new Map(SHAPES.map(s => [s.id, s]));

const ALIASES = {
    'journey and return': 'journey_return',
    'voyage and return': 'journey_return',
    'journey-return': 'journey_return',
    'comedy': 'comedy_of_errors',
    'kishotenketsu': 'kishotenketsu',
    'kishōtenketsu': 'kishotenketsu',
    'cumulative': 'quiet',
    'quiet or cumulative': 'quiet',
    'slice of life': 'quiet',
};

/**
 * Normalize a shape id or name to a catalogue id.
 * @param {string} value
 * @returns {string|null}
 */
export function normalizeShapeId(value) {
    if (typeof value !== 'string') return null;
    const key = value.trim().toLowerCase();
    if (!key) return null;
    if (BY_ID.has(key)) return key;
    const snake = key.replace(/[^a-z0-9ō]+/g, '_').replace(/^_|_$/g, '');
    if (BY_ID.has(snake)) return snake;
    return ALIASES[key] || ALIASES[snake.replace(/_/g, ' ')] || SHAPES.find(s => s.name.toLowerCase() === key)?.id || null;
}

/** @returns {Object|null} Shape definition */
export function getShape(id) {
    return BY_ID.get(normalizeShapeId(id)) || null;
}

/** @returns {Array<{id: string, name: string, summary: string}>} */
export function listShapes() {
    return SHAPES.map(({ id, name, summary, conflict }) => ({ id, name, summary, conflict }));
}

/**
 * The stage of a shape at a point within a pacing slot. Slots holding several
 * stages split evenly.
 * @param {Object|string} shape - Shape or id
 * @param {string} slot - Pacing phase
 * @param {number} [fraction=0] - Progress through the slot, 0..1
 * @returns {Object|null} Stage
 */
export function getStageForSlot(shape, slot, fraction = 0) {
    const def = typeof shape === 'string' ? getShape(shape) : shape;
    if (!def) return null;
    const phase = normalizePhase(slot);
    const stages = def.stages.filter(s => s.slot === phase);
    if (!stages.length) {
        // Fall back to the nearest earlier slot that has a stage
        for (let i = PHASES.indexOf(phase) - 1; i >= 0; i--) {
            const earlier = def.stages.filter(s => s.slot === PHASES[i]);
            if (earlier.length) return earlier[earlier.length - 1];
        }
        return def.stages[0];
    }
    const f = Math.min(0.9999, Math.max(0, Number(fraction) || 0));
    return stages[Math.floor(f * stages.length)];
}

/**
 * Find a stage by id (or name) in a shape.
 * @returns {Object|null}
 */
export function getStage(shape, stageId) {
    const def = typeof shape === 'string' ? getShape(shape) : shape;
    if (!def || !stageId) return null;
    const key = String(stageId).trim().toLowerCase();
    return def.stages.find(s => s.id === key || s.name.toLowerCase() === key) || null;
}

/** The id of the shape's climax-slot stage (the last one if several). */
export function getClimaxStageId(shape) {
    const def = typeof shape === 'string' ? getShape(shape) : shape;
    const climax = def?.stages.filter(s => s.slot === 'climax') || [];
    return climax.length ? climax[climax.length - 1].id : null;
}

/**
 * Clean an arc list: one spine first, at most MAX_THREADS threads, known shapes.
 * @param {Array<Object>} arcs - [{ id?, role?, shape, question?, stage_notes? }]
 * @returns {Array<Object>}
 */
export function normalizeArcs(arcs) {
    if (!Array.isArray(arcs)) return [];
    const known = arcs.filter(a => normalizeShapeId(a?.shape));
    // The arc marked spine (else the first) is the spine; the rest are threads
    const spineIndex = Math.max(0, known.findIndex(a => a.role === 'spine'));
    const ordered = known.length ? [known[spineIndex], ...known.filter((_, i) => i !== spineIndex)] : [];

    const usedIds = new Set();
    return ordered.slice(0, 1 + MAX_THREADS).map((raw, i) => {
        const role = i === 0 ? 'spine' : 'thread';
        const shape = normalizeShapeId(raw.shape);
        let id = role === 'spine' ? 'spine'
            : (String(raw.id || shape).trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_') || shape);
        if (id === 'spine' && role === 'thread') id = shape;
        while (usedIds.has(id)) id = `${id}_2`;
        usedIds.add(id);

        const arc = { id, role, shape };
        if (raw.question) arc.question = String(raw.question).trim();
        if (raw.stage_notes && typeof raw.stage_notes === 'object') {
            const notes = {};
            for (const [stageId, note] of Object.entries(raw.stage_notes)) {
                const stage = getStage(shape, stageId);
                if (stage && note) notes[stage.id] = String(note).trim();
            }
            if (Object.keys(notes).length) arc.stage_notes = notes;
        }
        return arc;
    });
}

/**
 * Arcs for a story type: its default shape as the spine plus suggested threads.
 * @param {Object} storyType
 * @returns {Array<Object>}
 */
export function getDefaultArcsForStoryType(storyType) {
    const spine = normalizeShapeId(storyType?.defaultShape) || 'escalation';
    const threads = (Array.isArray(storyType?.suggestedThreads) ? storyType.suggestedThreads : [])
        .map(normalizeShapeId).filter(Boolean).slice(0, MAX_THREADS);
    return normalizeArcs([{ role: 'spine', shape: spine }, ...threads.map(shape => ({ role: 'thread', shape }))]);
}

/**
 * Whether guidance written for a story type's default shape still fits.
 * The story type's phase prompts were written for its default shape; another
 * spine shape gets the shape's own stage guidance instead.
 */
export function storyTypeFitsShape(storyType, shapeId) {
    const own = normalizeShapeId(storyType?.defaultShape) || 'escalation';
    return own === normalizeShapeId(shapeId);
}
