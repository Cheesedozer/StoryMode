/**
 * Story phase model shared by Story Mode (round-based) and blueprint scenes.
 *
 * Both use the same four phases and the same proportions, so a story type's
 * phase guidance, a blueprint's scene phases and the round counter all agree.
 *
 * Older data used three phases (setup / confrontation / resolution). The
 * helpers here map that shape onto the four-phase model so custom story types
 * and saved blueprints keep working.
 */

/** Ordered phase ids. */
export const PHASES = ['setup', 'escalation', 'climax', 'resolution'];

/** Share of the story each phase occupies (sums to 1). */
export const PHASE_DISTRIBUTION = {
    setup: 0.25,
    escalation: 0.50,
    climax: 0.15,
    resolution: 0.10,
};

/** Display labels. */
export const PHASE_LABELS = {
    setup: 'Setup',
    escalation: 'Escalation',
    climax: 'Climax',
    resolution: 'Resolution',
};

/** Short descriptions, used for help text in editors. */
export const PHASE_DESCRIPTIONS = {
    setup: 'Who wants what, why, and what stands in the way',
    escalation: 'Attempts, costs, reversals; pressure keeps rising',
    climax: 'The decisive confrontation with the central conflict',
    resolution: 'Aftermath: what changed and what it cost',
};

const LEGACY_PHASE_ALIASES = {
    confrontation: 'escalation',
    'rising action': 'escalation',
    rising_action: 'escalation',
    middle: 'escalation',
    finale: 'climax',
    denouement: 'resolution',
    ending: 'resolution',
};

/**
 * Normalize any phase string (including legacy three-phase names) to a phase id.
 * @param {string} phase
 * @param {string} [fallback='setup']
 * @returns {string} One of PHASES
 */
export function normalizePhase(phase, fallback = 'setup') {
    if (typeof phase !== 'string') return fallback;
    const key = phase.trim().toLowerCase();
    if (PHASES.includes(key)) return key;
    return LEGACY_PHASE_ALIASES[key] || fallback;
}

/**
 * Human-readable distribution, e.g. "Setup (~25%) → Escalation (~50%) → ...".
 * @returns {string}
 */
export function describePhaseDistribution() {
    return PHASES
        .map(p => `${PHASE_LABELS[p]} (~${Math.round(PHASE_DISTRIBUTION[p] * 100)}%)`)
        .join(' → ');
}

/**
 * Get a story type's per-phase guidance in four-phase form.
 * Legacy three-phase types map confrontation → escalation; their single
 * resolution prompt is used for the climax as well, since it usually
 * described both the final confrontation and the aftermath.
 * @param {Object} storyType
 * @returns {{setup: string, escalation: string, climax: string, resolution: string}}
 */
export function getPhasePrompts(storyType) {
    const p = storyType?.phasePrompts || {};
    return {
        setup: p.setup || '',
        escalation: p.escalation || p.confrontation || '',
        climax: p.climax || p.resolution || '',
        resolution: p.resolution || '',
    };
}

/**
 * Round ranges for each phase in an arc of `arcLength` rounds.
 * Every phase gets at least one round once the arc is long enough.
 * @param {number} arcLength
 * @returns {Array<{phase: string, start: number, end: number}>} 1-based inclusive ranges
 */
export function getPhaseRanges(arcLength) {
    const ranges = [];
    let start = 1;
    let cumulative = 0;
    PHASES.forEach((phase, i) => {
        cumulative += PHASE_DISTRIBUTION[phase];
        const remainingPhases = PHASES.length - 1 - i;
        let end = i === PHASES.length - 1
            ? arcLength
            : Math.round(arcLength * cumulative);
        // Leave at least one round for each remaining phase, and take at least one
        end = Math.min(end, arcLength - remainingPhases);
        end = Math.max(end, start);
        ranges.push({ phase, start, end });
        start = end + 1;
    });
    return ranges;
}
