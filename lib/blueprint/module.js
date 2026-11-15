/**
 * Story Blueprint Module for Story Mode Extension
 *
 * Provides LLM-generated story structure with scenes, arcs, and resolutions.
 *
 * Architecture:
 * - Rounds/Steps: Individual turns starting with user message (already in StoryMode)
 * - Phases: Setup, Confrontation, Resolution (already in StoryMode)
 * - Scenes: Collections of rounds within a phase (NEW - this module)
 */

import { extension_settings, getContext } from '/scripts/extensions.js';
import { main_api } from '/script.js';
import {
    loadStoryTypes,
    loadAuthorStyles,
    getStoryTypes,
    getAuthorStyles,
} from '../core/state-manager.js';
import { MODULE_NAME } from '../core/index.js';
import { initNormalization } from './index.js';
import {
    initOrchestration,
    buildBlueprintRequest,
    generateBlueprint,
    generateOpeningMessage,
} from '../generation/index.js';

// Imports for re-export (import-then-export pattern for default export references)
import { getBlueprintState, saveBlueprintState } from './storage.js';
export { getBlueprintState, saveBlueprintState };

import {
    getSummarizingSceneIndex,
    trackMessageForScene as trackMessageForSceneInternal,
    triggerSummarizationIfNeeded,
    triggerCatchUpSummarization,
    getNextAutoSummaryInfo,
    manuallyGenerateSummary,
} from './summarization.js';
export {
    getSummarizingSceneIndex,
    triggerSummarizationIfNeeded,
    triggerCatchUpSummarization,
    getNextAutoSummaryInfo,
    manuallyGenerateSummary,
};

import { getCurrentScene, advanceSceneIndex } from './scene-pacing.js';
export { getCurrentScene, advanceSceneIndex };

import { buildBlueprintInjection } from './injection.js';
export { buildBlueprintInjection };

import {
    DEFAULT_MASTER_PROMPT,
    loadDefaultMasterPrompt,
    getEffectiveMasterPrompt,
    getEffectiveSceneSummaryPrompt,
} from './prompts.js';
export { getEffectiveMasterPrompt, getEffectiveSceneSummaryPrompt };

import { calculateTotalRounds, syncBlueprintSettings } from './settings-sync.js';
export { calculateTotalRounds, syncBlueprintSettings };

import { startStoryFromBlueprint } from './startup.js';
export { startStoryFromBlueprint };

export { generateBlueprint, buildBlueprintRequest, generateOpeningMessage };

// Ensure crypto.randomUUID() is available (Chrome 92+, Safari 15.4+, Firefox 95+)
if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'undefined') {
    crypto.randomUUID = () => '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
        (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
    );
}

/**
 * Get connection profiles from Connection Manager extension
 * @returns {Array<Object>} Array of connection profiles with id and name
 */
function getConnectionProfiles() {
    const context = getContext();

    // Check if Connection Manager extension is disabled
    if (context?.extensionSettings?.disabledExtensions?.includes('connection-manager')) {
        return [];
    }

    try {
        // Get profiles from extension settings
        const profiles = extension_settings?.connectionManager?.profiles || [];
        return profiles;
    } catch (error) {
        console.warn('[Story Mode Blueprint] Error getting connection profiles:', error);
        return [];
    }
}

/**
 * Generate a unique blueprint identifier using UUID v4
 * @returns {string} A UUID v4 identifier (RFC 4122 format)
 */
export function generateBlueprintId() {
    return crypto.randomUUID();
}

/**
 * Validate that a string is a valid UUID v4
 * @param {string} id - The ID to validate
 * @returns {boolean} True if valid UUID v4 format
 */
export function isValidBlueprintId(id) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

// Initialize normalization module with ID functions
// This must happen after generateBlueprintId and isValidBlueprintId are defined
initNormalization(generateBlueprintId, isValidBlueprintId);


/**
 * Get default cover generation settings
 * @returns {Object} Default cover generation settings
 */
function getDefaultCoverGenerationSettings() {
    return {
        enabled: true,
        autoGenerate: false,
        addToGallery: true,
        maxGallerySize: 10,
        defaultQuality: 'high',
        defaultAspectRatio: '2:3',
        defaultStyle: 'auto',
        showPromptOnGenerate: true,
        confirmDeleteCover: true,
        keyboardNavigation: true,
        showGalleryCounter: true,
        autoSelectLatest: true,
    };
}

/**
 * Initialize blueprint settings in extension_settings
 * Called during StoryMode initialization
 */
export async function initBlueprintSettings() {
    // Verify critical imports

    const settings = extension_settings[MODULE_NAME];

    // Initialize blueprintSettings if not present
    if (!settings.blueprintSettings) {
        settings.blueprintSettings = {
            enabled: false,
            useScenePrompts: true,
            masterPrompt: null,
            generationApi: null,
            summarizationEnabled: false,
            summarizeAfterScenes: 2,
            summaryMaxTokens: 500,
            includeSummariesInPrompt: true,
            summaryStyle: 'narrative',
            sceneSummaryPrompt: null,
            coverGeneration: getDefaultCoverGenerationSettings(),
            injectMissingCharacters: true,
        };
    } else {
        // Add new settings to existing configurations
        if (settings.blueprintSettings.generationApi === undefined) {
            settings.blueprintSettings.generationApi = null;
        }
        if (settings.blueprintSettings.injectMissingCharacters === undefined) {
            settings.blueprintSettings.injectMissingCharacters = true;
        }
        if (settings.blueprintSettings.summarizationEnabled === undefined) {
            settings.blueprintSettings.summarizationEnabled = false;
        }
        if (settings.blueprintSettings.summarizeAfterScenes === undefined) {
            settings.blueprintSettings.summarizeAfterScenes = 2;
        }
        if (settings.blueprintSettings.summaryMaxTokens === undefined) {
            settings.blueprintSettings.summaryMaxTokens = 500;
        }
        if (settings.blueprintSettings.includeSummariesInPrompt === undefined) {
            settings.blueprintSettings.includeSummariesInPrompt = true;
        }
        if (settings.blueprintSettings.summaryStyle === undefined) {
            settings.blueprintSettings.summaryStyle = 'narrative';
        }
        if (settings.blueprintSettings.sceneSummaryPrompt === undefined) {
            settings.blueprintSettings.sceneSummaryPrompt = null;
        }
        if (!settings.blueprintSettings.coverGeneration) {
            settings.blueprintSettings.coverGeneration = getDefaultCoverGenerationSettings();
        }
    }

    // Load default master prompt from file
    if (!DEFAULT_MASTER_PROMPT) {
        await loadDefaultMasterPrompt();
    }

    // Load story types and author styles if not already loaded
    // Uses state-manager.js as the single source of truth
    if (getStoryTypes().length === 0) {
        await loadStoryTypes();
    }
    if (getAuthorStyles().length === 0) {
        await loadAuthorStyles();
    }
}

/**
 * Track a message for scene summarization (wrapper injects getCurrentScene)
 * @param {number} messageId - The message ID to track
 * @param {Object} blueprintState - The blueprint state
 * @param {number} currentStep - Current round/step
 * @param {number} arcLength - Total arc length
 */
export function trackMessageForScene(messageId, blueprintState, currentStep, arcLength) {
    trackMessageForSceneInternal(messageId, blueprintState, getCurrentScene, currentStep, arcLength);
}

/**
 * Get the blueprint title with fallback if not present
 * @param {Object} blueprint - The blueprint object
 * @param {Array} characters - Array of character objects with name property
 * @returns {string} The blueprint title or a fallback string
 */
export function getBlueprintTitle(blueprint, characters = []) {
    // If blueprint has a title, return it
    if (blueprint && blueprint.blueprint_title) {
        return blueprint.blueprint_title;
    }

    // Fallback: construct title from story type and character names
    const storyType = blueprint?.story_type_name || blueprint?.story_type_id || 'Story';

    if (characters.length > 0) {
        const charNames = characters.slice(0, 2).map(c => c.name || c).join(', ');
        return `${storyType} - ${charNames}`;
    }

    return storyType;
}

// Initialize generation orchestration with dependencies
initOrchestration({
    generateBlueprintId,
    getConnectionProfiles,
    extension_settings,
    MODULE_NAME,
    main_api,
});

// Re-exports — import-then-export to create local bindings
import { PHASE_CONFIG } from '../core/index.js';
export { PHASE_CONFIG };
import { validateBlueprint, normalizeBlueprint } from './index.js';
export { validateBlueprint, normalizeBlueprint };
import { markBeatCompleted, markBeatSkipped, getCompletedBeats } from '../scenario/index.js';
export { markBeatCompleted, markBeatSkipped, getCompletedBeats };
