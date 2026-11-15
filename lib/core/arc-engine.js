/**
 * Arc Engine Module for Story Mode Extension
 *
 * Handles story arc phase calculations and prompt injection:
 * - Phase calculation (setup, confrontation, resolution)
 * - Story prompt building
 * - Author style injection
 * - Blueprint integration
 */

import {
    setExtensionPrompt,
    extension_prompt_types,
} from '/script.js';
import { extension_settings } from '/scripts/extensions.js';

// Import from state manager
import {
    MODULE_NAME,
    getStoryTypes,
    getAuthorStyles,
    getChatStoryState,
    getPacingMode,
    getEffectiveAuthorStyle,
} from './state-manager.js';

// Import blueprint functions
import * as BlueprintModule from '../blueprint/module.js';
import { getBlueprintState } from '../blueprint/storage.js';
import { getPhaseRanges, getPhasePrompts } from './phases.js';
import { getContentLevel, buildContentGuidance } from './content-level.js';

// ============================================================================
// PHASE CALCULATION
// ============================================================================

/**
 * Calculate phase information based on current step and arc length.
 * Divides the story into four phases: setup, escalation, climax, resolution (see phases.js).
 *
 * @param {number} currentStep - The current step number in the story arc.
 * @param {number} arcLength - The total length of the story arc.
 * @returns {Object} Phase information containing phase, positionInPhase, totalInPhase,
 *                   percentInPhase, phaseStart, and phaseEnd.
 */
export function getPhaseInfo(currentStep, arcLength) {
    // Validate inputs - default currentStep to 0, arcLength to 30
    if (currentStep === undefined || currentStep === null || currentStep < 0) {
        currentStep = 0;
    }
    if (!arcLength || arcLength <= 0) {
        arcLength = 30; // fallback to default
        console.warn('[Story Mode] Invalid arcLength, using default 30');
    }

    // Four phases shared with blueprint scenes (see phases.js)
    const ranges = getPhaseRanges(arcLength);
    const range = ranges.find(r => currentStep <= r.end) || ranges[ranges.length - 1];
    const phase = range.phase;
    const phaseStart = range.start;
    const phaseEnd = range.end;
    const positionInPhase = Math.max(0, currentStep - phaseStart + 1);

    const totalInPhase = phaseEnd - phaseStart + 1;
    const percentInPhase = Math.round((positionInPhase / totalInPhase) * 100);

    return {
        phase,
        positionInPhase,
        totalInPhase,
        percentInPhase,
        phaseStart,
        phaseEnd,
    };
}

// ============================================================================
// PROMPT BUILDING
// ============================================================================

/**
 * Build the story blueprint from a story type.
 * Returns the story prompt that guides the LLM on narrative structure.
 *
 * @param {Object} storyType - The story type object containing storyPrompt.
 * @returns {string} The story prompt text, or empty string if undefined.
 */
export function buildStoryBlueprint(storyType) {
    if (!storyType.storyPrompt) return '';

    const intro = `**Genre Framework:** Use the following genre description to shape your narrative voice, pacing, and storytelling choices. Let these elements guide tone, tropes, and dramatic structure throughout the story.`;

    return `${intro}\n\n${storyType.storyPrompt}`;
}

// Phase goals lookup - avoids repetitive if/else chain
const PHASE_GOALS = {
    setup: `<phase_goals>
    Make clear what the main characters want, why it matters to them, and what stands in their way.
    Bring the central problem in early and let it press on them, at a lower intensity than later phases.
    Plant details and relationships that can pay off later.
    End moments on open questions rather than tidy answers.
  </phase_goals>`,
    escalation: `<phase_goals>
    Make the goal harder to reach: each attempt costs something, reveals something, or creates a new problem.
    Let reversals grow out of choices already made, including {{user}}'s.
    Pressure relationships and beliefs until characters must commit to something.
  </phase_goals>`,
    climax: `<phase_goals>
    Bring the central conflict to its decisive confrontation now; there is no more room to delay it.
    Make {{user}}'s earlier choices matter to how it plays out.
    Force the hardest choice of the story and let its outcome stand.
  </phase_goals>`,
    resolution: `<phase_goals>
    Show the aftermath: what changed in the characters and their world, and what it cost.
    Pay off threads planted earlier.
    Let the story settle into a new normal.
  </phase_goals>`,
};

/**
 * Build debug instruction string if debug mode is enabled.
 * @param {Object} settings - Extension settings
 * @param {number} step - Current step
 * @param {number} arcLength - Total arc length
 * @param {string} phase - Current phase name
 * @returns {string} Debug instruction or empty string
 */
function buildDebugInstruction(settings, step, arcLength, phase) {
    if (!settings.debugMode) return '';
    return `\n[At the end of your response, add a debug note in this exact format: "(OOC: Step ${step}/${arcLength}, Phase: ${phase})"]`;
}

/**
 * Build the phase injection text with enhanced pacing constraints.
 * Replaces placeholders in the progress template with actual values.
 *
 * When a blueprint is active, returns minimal arc info (scene pacing is handled by blueprint).
 * In Scenario Mode with blueprint: returns minimal debug note only (blueprint handles ALL pacing).
 * In Story Mode (with or without blueprint): returns full pacing guidance in XML format.
 *
 * @param {Object} storyType - The story type object containing progressTemplate and phasePrompts.
 * @param {Object} phaseInfo - Phase information from getPhaseInfo.
 * @param {Object} chatState - Current chat story state containing arcLength.
 * @param {boolean} blueprintActive - If true AND in Scenario Mode, skip verbose pacing.
 * @returns {string} The formatted phase injection text with debug notes if debugMode is enabled.
 */
export function buildPhaseInjection(storyType, phaseInfo, chatState, blueprintActive = false) {
    const settings = extension_settings[MODULE_NAME];
    const { currentStep: nextStep, arcLength } = chatState;
    const debugNote = buildDebugInstruction(settings, nextStep, arcLength, phaseInfo.phase);

    // Scenario Mode (signal-based): No arc injection needed (blueprint provides complete pacing)
    const pacingMode = getPacingMode();
    if (blueprintActive && pacingMode === 'scenario') {
        return debugNote; // Return debug note only, no arc info
    }

    // Story Mode: Full pacing guidance (even if blueprint exists, it's not used for pacing)
    const roundsRemainingInPhase = phaseInfo.totalInPhase - phaseInfo.positionInPhase;
    const phaseGoals = PHASE_GOALS[phaseInfo.phase] || '';
    const arcPercent = Math.round((nextStep / arcLength) * 100);

    // Substitute variables in progress template
    const progressText = storyType.progressTemplate
        .replace(/{currentStep}/g, nextStep)
        .replace(/{arcLength}/g, arcLength)
        .replace(/{arcPercent}/g, arcPercent)
        .replace(/{phase}/g, phaseInfo.phase)
        .replace(/{positionInPhase}/g, phaseInfo.positionInPhase)
        .replace(/{totalInPhase}/g, phaseInfo.totalInPhase)
        .replace(/{phasePercent}/g, phaseInfo.percentInPhase)
        .replace(/{phaseStart}/g, phaseInfo.phaseStart)
        .replace(/{phaseEnd}/g, phaseInfo.phaseEnd);

    const phaseGuidance = getPhasePrompts(storyType)[phaseInfo.phase] || '';

    const output = `<story_pacing>
  <arc position="${nextStep}/${arcLength}" percent="${arcPercent}%"/>
  <phase name="${phaseInfo.phase.toUpperCase()}" rounds="${phaseInfo.phaseStart}-${phaseInfo.phaseEnd}" position="${phaseInfo.positionInPhase}/${phaseInfo.totalInPhase}" remaining="${roundsRemainingInPhase}"/>
  ${phaseGoals}
</story_pacing>

${progressText}

${phaseGuidance}${debugNote ? '\n' + debugNote : ''}`;

    return output.trim();
}

/**
 * Build the full extension prompt injection string.
 * Combines story arc and author style content based on current settings.
 *
 * In Scenario Mode: includes blueprint injection with full scene pacing.
 * In Story Mode: includes story type + author style with full arc pacing (no blueprint).
 *
 * @param {boolean} isPreview - If true, ignore arc length limits and build full prompt for preview.
 * @returns {string} The complete injection text, or empty string if disabled.
 */
export function buildFullInjection(isPreview = false) {
    const settings = extension_settings[MODULE_NAME];
    const chatState = getChatStoryState();
    const storyTypes = getStoryTypes();
    const authorStyles = getAuthorStyles();
    const pacingMode = getPacingMode();

    if (!settings.enabled) {
        return '';
    }

    let parts = [];

    // Check if blueprint is active (Scenario Mode)
    let blueprintActive = false;
    let blueprintState = null;
    if (settings.blueprintSettings?.enabled && settings.blueprintSettings?.useScenePrompts) {
        blueprintState = getBlueprintState();
        blueprintActive = blueprintState?.useBlueprint && blueprintState?.blueprint;
    }

    // GENRE INJECTION - controlled by storyTypeEnabled toggle
    // Only inject in Story Mode when toggle is enabled
    if (pacingMode === 'story' && settings.storyTypeEnabled && chatState.selectedStoryType) {
        const storyType = storyTypes.find(t => t.id === chatState.selectedStoryType);

        if (!storyType) {
            console.warn(`[Story Mode] Chat references story type "${chatState.selectedStoryType}" which was not found in the library`);
        }

        if (storyType) {
            // Build the genre framework (story blueprint)
            let storyContent = buildStoryBlueprint(storyType);

            // ARC TRACKING - controlled by storyArcEnabled toggle
            // Only add phase injection when arc tracking is enabled
            if (settings.storyArcEnabled) {
                const shouldBuildPhase = chatState.currentStep < chatState.arcLength || isPreview;
                if (shouldBuildPhase) {
                    const nextStep = chatState.currentStep;
                    const phaseInfo = getPhaseInfo(nextStep, chatState.arcLength);
                    const phaseText = buildPhaseInjection(storyType, phaseInfo, chatState, false);
                    storyContent += `\n\n${phaseText}`;
                }
            }
            // If storyArcEnabled is false: Skip phase injection entirely

            parts.push(`<story>\n${storyContent}\n</story>`);
        }
    }

    // Author style injection - PRESERVE THE CASCADE LOGIC
    // Uses getEffectiveAuthorStyle() which handles: blueprint > character > group > chat > default
    const { styleId } = getEffectiveAuthorStyle();
    const activeStyle = settings.authorStyleEnabled && styleId
        ? authorStyles.find(s => s.id === styleId)
        : null;
    if (activeStyle?.authorPrompt) {
        parts.push(`<style>\n${activeStyle.authorPrompt}\n</style>`);
    }

    // Mature content guidance - global level, voiced by the active style
    const contentLevel = getContentLevel(settings);
    const contentGuidance = buildContentGuidance(contentLevel, activeStyle?.nsfwPrompt);
    if (contentGuidance) {
        parts.push(`<content_guidance level="${contentLevel}">\n${contentGuidance}\n</content_guidance>`);
    }

    // Blueprint injection - only in Scenario Mode with active blueprint
    if (pacingMode === 'scenario' && blueprintActive) {
        const blueprintInjection = buildBlueprintInjection(blueprintState);
        if (blueprintInjection) {
            parts.push(blueprintInjection);
        }
    }

    // OOC (Out of Context) injection - persistent user instructions
    if (settings.oocText && settings.oocText.trim().length > 0) {
        parts.push(`<out_of_context> [ ${settings.oocText.trim()} ] </out_of_context>`);
    }

    return parts.join('\n\n');
}

/**
 * Build blueprint injection for Scenario Mode
 * @param {Object} blueprintState - Blueprint state object
 * @returns {string} Blueprint injection or empty string
 */
function buildBlueprintInjection(blueprintState) {
    if (!blueprintState?.blueprint) return '';

    const blueprintContent = BlueprintModule.buildBlueprintInjection(blueprintState);

    if (!blueprintContent) return '';

    return `<blueprint>\n${blueprintContent}\n</blueprint>`;
}

// ============================================================================
// PROMPT INJECTION
// ============================================================================

/**
 * Update the extension prompt injection in SillyTavern.
 * Clears the prompt if extension is disabled or no content to inject.
 */
export function updateStoryPrompt() {
    const settings = extension_settings[MODULE_NAME];

    if (!settings.enabled) {
        setExtensionPrompt(MODULE_NAME, '', extension_prompt_types.NONE, 0);
        console.debug('[Story Mode] Prompt cleared (disabled)');
        return;
    }

    const promptText = buildFullInjection(false);

    if (!promptText) {
        setExtensionPrompt(MODULE_NAME, '', extension_prompt_types.NONE, 0);
        console.debug('[Story Mode] Prompt cleared (no content)');
        return;
    }

    // Inject the prompt
    setExtensionPrompt(
        MODULE_NAME,
        promptText,
        settings.position,
        settings.depth,
        false,
        settings.role
    );

    console.debug('[Story Mode] Prompt injected:', promptText);
}
