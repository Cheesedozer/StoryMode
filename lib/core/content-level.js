/**
 * Mature content level.
 *
 * One global setting decides how far intimate content may go on the page.
 * Each author style's `nsfwPrompt` describes how that voice writes intimacy;
 * it is added on top of the level guidance and never restricts it.
 */

export const CONTENT_LEVELS = {
    OFF: 'off',
    INTIMACY: 'intimacy',
    EXPLICIT: 'explicit',
};

export const CONTENT_LEVEL_OPTIONS = [
    { value: CONTENT_LEVELS.OFF, label: 'Off', description: 'No mature-content guidance is added; the model and your preset decide' },
    { value: CONTENT_LEVELS.INTIMACY, label: 'Intimacy', description: 'Romance, desire and physical affection on the page; sex scenes cut away' },
    { value: CONTENT_LEVELS.EXPLICIT, label: 'Explicit', description: 'Sex scenes may be written explicitly and in full' },
];

const LEVEL_GUIDANCE = {
    [CONTENT_LEVELS.INTIMACY]: 'Romance, desire, and physical affection belong on the page and can be written with heat and specificity. When a scene turns to sex, write the build-up and the emotional aftermath in full and pass over the act itself with a scene break.',
    [CONTENT_LEVELS.EXPLICIT]: 'Sexual content can be written explicitly and in full when the story and the characters lead there. Give it the same craft as any other scene: specific, character-driven, and in the story\'s voice.',
};

const ADULTS_ONLY = 'All characters in sexual content are adults.';

/**
 * Resolve the effective content level from settings, migrating the legacy
 * boolean `nsfwEnabled` (true → explicit).
 * @param {Object} settings - Story Mode extension settings
 * @returns {string} One of CONTENT_LEVELS
 */
export function getContentLevel(settings) {
    const level = settings?.contentLevel;
    if (Object.values(CONTENT_LEVELS).includes(level)) return level;
    return settings?.nsfwEnabled ? CONTENT_LEVELS.EXPLICIT : CONTENT_LEVELS.OFF;
}

/**
 * Build the content guidance text for prompts.
 * @param {string} level - One of CONTENT_LEVELS
 * @param {string} [stylePrompt] - The active author style's nsfwPrompt
 * @returns {string} Guidance text, or '' when the level is off
 */
export function buildContentGuidance(level, stylePrompt = '') {
    const base = LEVEL_GUIDANCE[level];
    if (!base) return '';
    const parts = [base, ADULTS_ONLY];
    if (stylePrompt && stylePrompt.trim()) {
        parts.push(`How this style handles it: ${stylePrompt.trim()}`);
    }
    return parts.join('\n');
}
