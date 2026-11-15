/**
 * State Manager Module for Story Mode Extension
 *
 * Handles all state management including:
 * - Extension settings (global and per-chat)
 * - Story types and author styles data
 * - File API persistence (via file-backed-data.js)
 * - Fuse.js fuzzy search initialization
 */

import {
    saveSettingsDebounced,
    extension_prompt_types,
    extension_prompt_roles,
    saveMetadata,
} from '/script.js';
import { extension_settings, getContext } from '/scripts/extensions.js';
import { characters, this_chid } from '/script.js';
import { groups, selected_group } from '/scripts/group-chats.js';
import {
    loadStoryTypesFromFile,
    loadAuthorStylesFromFile,
    saveStoryTypesToFileImmediate,
    saveAuthorStylesToFileImmediate,
    loadOriginalStoryTypesFromFile,
    loadOriginalAuthorStylesFromFile,
} from './file-backed-data.js';

// ============================================================================
// MODULE CONSTANTS
// ============================================================================

export const MODULE_NAME = 'story_mode';

/** Pacing mode constants to avoid magic strings */
export const PACING_MODES = {
    STORY: 'story',
    SCENARIO: 'scenario'
};

/** Base URL for loading extension data files */
export const extensionBaseUrl = new URL('../..', import.meta.url).href;

/** Default extension settings */
export const defaultSettings = {
    enabled: false,
    storyTypeEnabled: true,     // NEW: Controls genre prompt injection
    storyArcEnabled: false,     // EXISTING: Now only controls arc tracking
    selectedStoryType: '',
    selectedAuthorStyle: '',
    defaultAuthorStyle: '',
    arcLength: 30,
    currentStep: 0,
    authorStyleEnabled: false,
    tracker: { mode: 'inline', profileId: '', timeoutSeconds: 20 }, // see lib/story/tracker.js
    ledger: { visible: false, budgetTokens: 400 },                  // see lib/story/ledger.js
    complications: { enabled: true, stallReplies: 4 },              // see lib/story/drama.js
    contentLevel: 'off', // 'off' | 'intimacy' | 'explicit' (see content-level.js)
    epilogueEnabled: false,
    summaryEnabled: false,
    nextAdventureEnabled: false,
    summaryMessageCount: 0, // 0 = entire chat, >0 = last N messages
    debugMode: false,
    debugPanelEnabled: false,
    debugPanelRolledUp: false,
    position: extension_prompt_types.IN_CHAT,
    depth: 4,
    role: extension_prompt_roles.SYSTEM,
    epilogueApi: null,
    summaryApi: null,
    nextAdventureApi: null,
    groupAuthorStyles: {}, // { 'group-id': 'author-style-id' }
    // Note: storyTypes and authorStyles are stored via File API, not extension_settings
    // Utility API profiles
    utilityApis: {
        styleGeneration: ''  // Connection profile ID or empty for default
    },
    // Scene Image Generation settings
    imageGeneration: {
        enabled: false,
        sdProfile: null,
        autoGenerate: false,
        addToGallery: false,
        imageStyle: 'auto',
        customStylePrompt: '',
    },
    // Scene Images storage (per-blueprint, per-scene)
    sceneImages: {},
};

// ============================================================================
// DATA STORAGE
// ============================================================================

/** Story type definitions */
let storyTypes = [];

/** Author style definitions */
let authorStyles = [];


/** Fuse.js instance for author style search */
let fuseAuthorStyles = null;

/** Original (unmodified) story types for revert functionality */
let originalStoryTypes = [];

/** Original (unmodified) author styles for revert functionality */
let originalAuthorStyles = [];

// ============================================================================
// DATA ACCESSORS
// ============================================================================

/**
 * Get the current story types array
 * @returns {Array} Story types array
 */
export function getStoryTypes() {
    return storyTypes;
}

/**
 * Get the current author styles array
 * @returns {Array} Author styles array
 */
export function getAuthorStyles() {
    return authorStyles;
}


/**
 * Get Fuse.js instance for author style search
 * @returns {Fuse|null} Fuse instance or null
 */
export function getFuseAuthorStyles() {
    return fuseAuthorStyles;
}

/**
 * Set the story types array (used during data updates)
 * @param {Array} types - New story types array
 */
export function setStoryTypes(types) {
    storyTypes = types;
}

/**
 * Set the author styles array (used during data updates)
 * @param {Array} styles - New author styles array
 */
export function setAuthorStyles(styles) {
    authorStyles = styles;
}

// ============================================================================
// SETTINGS MANAGEMENT
// ============================================================================

/**
 * Load extension settings from the global extension_settings object.
 * Merges loaded settings with defaults to ensure all properties exist.
 */
export function loadSettings() {
    if (!extension_settings[MODULE_NAME]) {
        extension_settings[MODULE_NAME] = structuredClone(defaultSettings);
    }

    // Migrate existing users: add storyTypeEnabled default
    const settings = extension_settings[MODULE_NAME];
    if (settings.storyTypeEnabled === undefined) {
        // If user had storyArcEnabled, assume they want genre too
        settings.storyTypeEnabled = settings.storyArcEnabled ?? true;
    }

    // Merge with defaults
    extension_settings[MODULE_NAME] = Object.assign(
        {},
        defaultSettings,
        extension_settings[MODULE_NAME]
    );

    // Migration: boolean nsfwEnabled -> three-level contentLevel
    {
        const s = extension_settings[MODULE_NAME];
        if (s.contentLevel === undefined || s.contentLevel === 'off' && s.nsfwEnabled) {
            s.contentLevel = s.nsfwEnabled ? 'explicit' : 'off';
        }
        delete s.nsfwEnabled;
    }

    // Migration: copy selectedAuthorStyle to defaultAuthorStyle if not set
    // This preserves existing users' author style as their new default
    if (!extension_settings[MODULE_NAME].defaultAuthorStyle &&
        extension_settings[MODULE_NAME].selectedAuthorStyle) {
        extension_settings[MODULE_NAME].defaultAuthorStyle =
            extension_settings[MODULE_NAME].selectedAuthorStyle;
    }
}

/**
 * Get the extension settings object
 * @returns {Object} Extension settings
 */
export function getSettings() {
    return extension_settings[MODULE_NAME];
}

// ============================================================================
// CHAT STATE MANAGEMENT
// ============================================================================

/**
 * Create a fresh play-state object.
 *
 * `chatState.scenario` is the single source of truth for in-play progress:
 * the current scene, beat statuses, and the story ledger. (Older chats also
 * kept a scene index and beat list on blueprintState; migratePlayState folds
 * those in and removes them.)
 * @returns {{currentSceneIndex: number, beatState: Object, ledger: Array, trackerFallback: boolean}}
 */
export function createPlayState() {
    return {
        currentSceneIndex: 0,
        beatState: {},     // { 0: { status: 'complete' | 'skipped', timestamp } }
        ledger: [],        // see lib/story/ledger.js
        trackerFallback: false, // secondary tracker failed: use inline markers for the next reply
        // Drama manager (lib/story/drama.js)
        firedTentpoles: {},     // { id: { scene, chapter, at } }
        usedComplications: [],  // complication ids already drawn
        activeEvents: [],       // [{ kind: 'tentpole' | 'complication', id, scene, replies }]
        stall: 0,               // AI replies since the last progress
        endingLean: null,       // { id, score, frozen } once the climax is reached
    };
}

/**
 * Fold the legacy duplicate state (blueprintState.currentSceneIndex and
 * blueprintState.beatProgress) into chatState.scenario, then remove it.
 * Safe to run repeatedly.
 * @param {Object} meta - chat_metadata[MODULE_NAME]
 */
function migratePlayState(meta) {
    // Fill missing fields in place: callers may hold a reference to the
    // scenario object across other state reads, so it must stay the same object
    if (!meta.scenario || typeof meta.scenario !== 'object') meta.scenario = createPlayState();
    const play = meta.scenario;
    for (const [key, value] of Object.entries(createPlayState())) {
        if (play[key] === undefined) play[key] = value;
    }
    if (!play.beatState || typeof play.beatState !== 'object') play.beatState = {};
    if (!Array.isArray(play.ledger)) play.ledger = [];
    if (!play.firedTentpoles || typeof play.firedTentpoles !== 'object') play.firedTentpoles = {};
    if (!Array.isArray(play.usedComplications)) play.usedComplications = [];
    if (!Array.isArray(play.activeEvents)) play.activeEvents = [];

    const legacy = meta.blueprintState;
    if (!legacy) return;

    if (typeof legacy.currentSceneIndex === 'number') {
        // Chats from before scenario state existed only had this copy
        if (!play.currentSceneIndex && legacy.currentSceneIndex > 0) {
            play.currentSceneIndex = legacy.currentSceneIndex;
        }
        delete legacy.currentSceneIndex;
    }

    if (legacy.beatProgress) {
        if (Object.keys(play.beatState).length === 0) {
            const prefix = `scene_${play.currentSceneIndex}_beat_`;
            for (const id of legacy.beatProgress.completedBeats || []) {
                if (typeof id === 'string' && id.startsWith(prefix)) {
                    play.beatState[parseInt(id.slice(prefix.length), 10)] = { status: 'complete', timestamp: Date.now() };
                }
            }
        }
        delete legacy.beatProgress;
    }
}

/**
 * Get the current per-chat story mode state from chat metadata.
 * Initializes the metadata object with global defaults if not present.
 *
 * @returns {Object} The chat's story mode state containing currentStep, arcStarted,
 *                   epilogueShown, summaryShown, selectedStoryType, selectedAuthorStyle, and arcLength.
 */
export function getChatStoryState() {
    // Always pull a fresh context to ensure we're reading the latest state
    const { chatMetadata } = getContext();
    const settings = extension_settings[MODULE_NAME];

    if (!chatMetadata[MODULE_NAME]) {
        // Initialize new chat with current global settings
        chatMetadata[MODULE_NAME] = {
            currentStep: 0,
            arcStarted: false,
            epilogueShown: false,
            summaryShown: false,
            nextAdventureShown: false,
            endNoticeShown: false,
            savedEpilogue: null,
            savedSummary: null,
            savedNextAdventure: null,
            selectedStoryType: settings.selectedStoryType || '',
            selectedAuthorStyle: settings.defaultAuthorStyle || '',
            arcLength: settings.arcLength || 30,
            pacingMode: 'story', // 'story' | 'scenario'
            storyShape: '',      // Story Mode spine shape; '' = story type default
            threadShapes: null,  // Story Mode thread shapes; null = story type default
            scenario: createPlayState(),
        };
    } else {
        // Migration: Ensure all properties exist for existing/partial chats
        const meta = chatMetadata[MODULE_NAME];

        // Arc state defaults
        if (meta.currentStep === undefined || meta.currentStep === null) {
            meta.currentStep = 0;
        }
        if (!meta.arcLength) {
            meta.arcLength = 30;
        }
        if (meta.arcStarted === undefined) {
            meta.arcStarted = false;
        }

        // Author style: inherit from default if not set
        if (meta.selectedAuthorStyle === undefined) {
            meta.selectedAuthorStyle = settings.defaultAuthorStyle || '';
        }
        // Story type: inherit from global if not set
        if (meta.selectedStoryType === undefined) {
            meta.selectedStoryType = settings.selectedStoryType || '';
        }

        // Pacing mode
        if (!meta.pacingMode) {
            meta.pacingMode = 'story';
        }
        migratePlayState(meta);

        // End-of-arc state
        if (meta.epilogueShown === undefined) {
            meta.epilogueShown = false;
        }
        if (meta.summaryShown === undefined) {
            meta.summaryShown = false;
        }
        if (meta.endNoticeShown === undefined) {
            meta.endNoticeShown = false;
        }
        if (meta.nextAdventureShown === undefined) {
            meta.nextAdventureShown = false;
        }
        if (meta.savedEpilogue === undefined) {
            meta.savedEpilogue = null;
        }
        if (meta.savedSummary === undefined) {
            meta.savedSummary = null;
        }
        if (meta.savedNextAdventure === undefined) {
            meta.savedNextAdventure = null;
        }
    }
    return chatMetadata[MODULE_NAME];
}

/**
 * Save the per-chat story mode state to metadata and persist to server.
 *
 * @async
 * @param {Object} state - The story mode state object to save.
 */
export async function saveChatStoryState(state) {
    // Always pull a fresh context
    const { chatMetadata } = getContext();

    // Update this chat's metadata
    chatMetadata[MODULE_NAME] = state;

    // Persist to the server/chat file
    await saveMetadata();
}

/**
 * Get the current pacing mode ('story' or 'scenario')
 * @returns {string} The current pacing mode
 */
export function getPacingMode() {
    const state = getChatStoryState();
    return state.pacingMode || 'story';
}

/**
 * Set the pacing mode
 * @param {string} mode - 'story' or 'scenario'
 */
export function setPacingMode(mode) {
    const state = getChatStoryState();
    state.pacingMode = mode;
    saveChatStoryState(state);
}

/**
 * Get the scenario state object
 * @returns {Object} The play state { currentSceneIndex, beatState, ledger, trackerFallback }
 */
export function getScenarioState() {
    const state = getChatStoryState();
    // specific safety check
    if (!state.scenario) {
        state.scenario = createPlayState();
        saveChatStoryState(state);
    }
    return state.scenario;
}

/**
 * Update the scenario state partially
 * @param {Object} updates - Object containing properties to update
 */
export function updateScenarioState(updates) {
    const state = getChatStoryState();
    if (!state.scenario) state.scenario = createPlayState();

    state.scenario = { ...state.scenario, ...updates };
    saveChatStoryState(state);
}

/**
 * Get the current scene index (authoritative source)
 * @returns {number} Current scene index
 */
export function getCurrentSceneIndex() {
    const scenario = getScenarioState();
    return scenario.currentSceneIndex || 0;
}

/**
 * Set the current scene index
 * @param {number} index - New scene index
 */
export function setCurrentSceneIndex(index) {
    updateScenarioState({ currentSceneIndex: index });
}

// ============================================================================
// BEAT STATE MANAGEMENT
// ============================================================================

/**
 * Get beat state for current scene
 * @returns {Object} Beat state map { beatIndex: { status, timestamp } }
 */
export function getBeatState() {
    const scenario = getScenarioState();
    return scenario.beatState || {};
}

/**
 * Mark a beat as complete
 * @param {number} beatIndex - Beat index
 */
export function markBeatComplete(beatIndex) {
    const state = getChatStoryState();
    if (!state.scenario.beatState) state.scenario.beatState = {};
    state.scenario.beatState[beatIndex] = {
        status: 'complete',
        timestamp: Date.now()
    };
    saveChatStoryState(state);
}

/**
 * Mark a beat as skipped
 * @param {number} beatIndex - Beat index
 */
export function markBeatSkipped(beatIndex) {
    const state = getChatStoryState();
    if (!state.scenario.beatState) state.scenario.beatState = {};
    state.scenario.beatState[beatIndex] = {
        status: 'skipped',
        timestamp: Date.now()
    };
    saveChatStoryState(state);
}

/**
 * Reset beat state (e.g., on scene change)
 */
export function resetBeatState() {
    const state = getChatStoryState();
    state.scenario.beatState = {};
    saveChatStoryState(state);
}

/**
 * Get completed beat indices for current scene
 * @returns {number[]} Array of completed beat indices
 */
export function getCompletedBeatIndices() {
    const beatState = getBeatState();
    return Object.entries(beatState)
        .filter(([_, state]) => state.status === 'complete')
        .map(([idx, _]) => parseInt(idx));
}

// ============================================================================
// DATA LOADING
// ============================================================================

/**
 * Load story types from File API storage.
 * Falls back to localforage, then default JSON file.
 * Initializes Fuse.js for fuzzy search after loading.
 *
 * @async
 */
export async function loadStoryTypes() {
    try {
        const result = await loadStoryTypesFromFile(
            new URL('data/story_types.json', extensionBaseUrl).href,
        );
        if (result && result.length > 0) {
            storyTypes = result;
        }
        await backfillStoryTypeShapes();
    } catch (error) {
        console.error('[Story Mode] Failed to load story types:', error);
    }
}

/**
 * Story types saved before arc shapes existed have no defaultShape. Fill it
 * (and suggestedThreads) from the bundled defaults with the same id, in
 * memory only; the user's file is not rewritten.
 */
async function backfillStoryTypeShapes() {
    if (!storyTypes.some(t => !t.defaultShape)) return;
    try {
        const response = await fetch(new URL('data/story_types.json', extensionBaseUrl));
        if (!response.ok) return;
        const defaults = new Map((await response.json()).map(t => [String(t.id).trim(), t]));
        for (const type of storyTypes) {
            const bundled = defaults.get(String(type.id).trim());
            if (type.defaultShape || !bundled?.defaultShape) continue;
            type.defaultShape = bundled.defaultShape;
            if (!type.suggestedThreads && bundled.suggestedThreads) type.suggestedThreads = [...bundled.suggestedThreads];
        }
    } catch (error) {
        console.warn('[Story Mode] Could not backfill story type shapes:', error);
    }
}

/**
 * Load author styles from File API storage.
 * Falls back to localforage, then default JSON file.
 * Initializes Fuse.js for fuzzy search after loading.
 *
 * @async
 */
export async function loadAuthorStyles() {
    try {
        const result = await loadAuthorStylesFromFile(
            new URL('data/author_styles.json', extensionBaseUrl).href,
        );
        if (result && result.length > 0) {
            authorStyles = result;
        }
        initFuseAuthorStyles();
    } catch (error) {
        console.error('[Story Mode] Failed to load author styles:', error);
    }
}

// ============================================================================
// DATA PERSISTENCE
// ============================================================================

/**
 * Save story types to File API storage.
 * Reinitializes Fuse.js after saving.
 *
 * @async
 * @returns {Promise<boolean>} True if save succeeded, false otherwise
 */
export async function saveStoryTypesToStorage() {
    const success = await saveStoryTypesToFileImmediate(storyTypes);
    if (!success) {
        console.error('[Story Mode] Failed to save story types');
        toastr.error('Failed to save story types');
        return false;
    }
    return true;
}

/**
 * Save author styles to File API storage.
 * Reinitializes Fuse.js after saving.
 *
 * @async
 * @returns {Promise<boolean>} True if save succeeded, false otherwise
 */
export async function saveAuthorStylesToStorage() {
    const success = await saveAuthorStylesToFileImmediate(authorStyles);
    if (!success) {
        console.error('[Story Mode] Failed to save author styles');
        toastr.error('Failed to save author styles');
        return false;
    }
    initFuseAuthorStyles();
    return true;
}


/**
 * Initialize Fuse.js for author style fuzzy search
 */
function initFuseAuthorStyles() {
    if (typeof Fuse !== 'undefined') {
        try {
            fuseAuthorStyles = new Fuse(authorStyles, {
                keys: ['name', 'category', 'authorPrompt', 'keywords'],
                threshold: 0.3,
            });
        } catch (fuseError) {
            console.error('[Story Mode] Failed to initialize Fuse.js for author styles:', fuseError);
        }
    }
}

/**
 * Load Fuse.js library for fuzzy search
 *
 * @async
 */
export async function loadFuseJS() {
    if (typeof Fuse !== 'undefined') {
        return;
    }
    try {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/fuse.js@6.6.2/dist/fuse.min.js';
        script.async = true;
        await new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    } catch (error) {
        console.error('[Story Mode] Failed to load Fuse.js:', error);
    }
}

// ============================================================================
// ORIGINAL DATA (FOR REVERT FUNCTIONALITY)
// ============================================================================

/**
 * Load original (unmodified) story types for revert functionality.
 * Retrieves from File API or creates a backup from current loaded types.
 *
 * @async
 */
export async function loadOriginalStoryTypes() {
    try {
        const stored = await loadOriginalStoryTypesFromFile(storyTypes);
        if (stored && stored.length > 0) {
            originalStoryTypes = stored;
        }
    } catch (error) {
        console.error('[Story Mode] Error loading original story types:', error);
    }
}

/**
 * Load original (unmodified) author styles for revert functionality.
 * Retrieves from File API or creates a backup from current loaded styles.
 *
 * @async
 */
export async function loadOriginalAuthorStyles() {
    try {
        const stored = await loadOriginalAuthorStylesFromFile(authorStyles);
        if (stored && stored.length > 0) {
            originalAuthorStyles = stored;
        }
    } catch (error) {
        console.error('[Story Mode] Error loading original author styles:', error);
    }
}

/**
 * Get an original (unmodified) story type by ID.
 * Used to revert user customizations to the default version.
 *
 * @param {string} id - The unique identifier of the story type.
 * @returns {Object|undefined} The original story type object, or undefined if not found.
 */
export function getOriginalStoryType(id) {
    return originalStoryTypes.find(t => t.id === id);
}

/**
 * Get an original (unmodified) author style by ID.
 * Used to revert user customizations to the default version.
 *
 * @param {string} id - The unique identifier of the author style.
 * @returns {Object|undefined} The original author style object, or undefined if not found.
 */
export function getOriginalAuthorStyle(id) {
    return originalAuthorStyles.find(s => s.id === id);
}

// ============================================================================
// CONNECTION PROFILES
// ============================================================================

/**
 * Get connection profiles from Connection Manager extension
 * @returns {Array<Object>} Array of connection profiles with id and name
 */
export function getConnectionProfiles() {
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
        console.warn('[Story Mode] Error getting connection profiles:', error);
        return [];
    }
}

// ============================================================================
// EFFECTIVE AUTHOR STYLE RESOLUTION
// ============================================================================


/**
 * Check if an author style ID exists in the loaded author styles library.
 * @param {string} styleId - The author style ID to check
 * @returns {boolean} True if the style exists
 */
function authorStyleExists(styleId) {
    return authorStyles.some(s => s.id === styleId);
}

/**
 * Get the effective author style with source information.
 * Priority: Blueprint > Character/Group > Per-Chat > Default
 *
 * IMPORTANT: Empty string ("") means "defer to next level", not "force no style"
 * If a style ID is referenced but doesn't exist in the library, it's skipped with a warning.
 *
 * @returns {{ styleId: string, source: 'blueprint'|'character'|'group'|'chat'|'default'|'none', sourceName?: string }}
 */
export function getEffectiveAuthorStyle() {
    const settings = extension_settings[MODULE_NAME];
    const chatState = getChatStoryState();
    const pacingMode = getPacingMode();

    // Priority 1: Blueprint author style (when in Scenario Mode with active blueprint)
    if (pacingMode === 'scenario') {
        // Check blueprint settings - use stored blueprint state from chatMetadata
        if (settings.blueprintSettings?.enabled && settings.blueprintSettings?.useScenePrompts) {
            // Access blueprint state from chat metadata directly (synchronous)
            const context = getContext();
            const blueprintState = context.chatMetadata?.[MODULE_NAME]?.blueprintState;
            if (blueprintState?.useBlueprint && blueprintState?.blueprint?.author_style) {
                const bpStyle = blueprintState.blueprint.author_style;
                if (authorStyleExists(bpStyle)) {
                    return {
                        styleId: bpStyle,
                        source: 'blueprint',
                        sourceName: blueprintState.blueprint.blueprint_title || 'Blueprint'
                    };
                }
                console.warn(`[Story Mode] Blueprint "${blueprintState.blueprint.blueprint_title}" references author style "${bpStyle}" which was not found in the library`);
            }
        }
    }

    // Priority 2: Character author style (1:1 chats only)
    // Empty string means "defer to next level", so only override if actually set
    if (selected_group === null && this_chid !== undefined && characters?.[this_chid]) {
        const char = characters[this_chid];
        const charAuthorStyle = char.data?.extensions?.story_mode?.authorStyle;
        if (charAuthorStyle && charAuthorStyle !== '') {
            if (authorStyleExists(charAuthorStyle)) {
                return {
                    styleId: charAuthorStyle,
                    source: 'character',
                    sourceName: char.name
                };
            }
            console.warn(`[Story Mode] Character "${char.name}" references author style "${charAuthorStyle}" which was not found in the library`);
        }
    }

    // Priority 3: Group author style (group chats only)
    // Stored in extension settings keyed by group ID
    if (selected_group !== null) {
        const groupAuthorStyle = settings.groupAuthorStyles?.[selected_group];
        if (groupAuthorStyle && groupAuthorStyle !== '') {
            if (authorStyleExists(groupAuthorStyle)) {
                // Get group name for display
                const group = groups?.find(g => g.id === selected_group);
                return {
                    styleId: groupAuthorStyle,
                    source: 'group',
                    sourceName: group?.name || 'Group'
                };
            }
            const group = groups?.find(g => g.id === selected_group);
            console.warn(`[Story Mode] Group "${group?.name || selected_group}" references author style "${groupAuthorStyle}" which was not found in the library`);
        }
    }

    // Priority 4: Per-chat author style
    if (chatState.selectedAuthorStyle && chatState.selectedAuthorStyle !== '') {
        if (authorStyleExists(chatState.selectedAuthorStyle)) {
            return {
                styleId: chatState.selectedAuthorStyle,
                source: 'chat',
                sourceName: null
            };
        }
        console.warn(`[Story Mode] Chat references author style "${chatState.selectedAuthorStyle}" which was not found in the library`);
    }

    // Priority 5: Default author style
    if (settings.defaultAuthorStyle && settings.defaultAuthorStyle !== '') {
        if (authorStyleExists(settings.defaultAuthorStyle)) {
            return {
                styleId: settings.defaultAuthorStyle,
                source: 'default',
                sourceName: null
            };
        }
        console.warn(`[Story Mode] Default author style "${settings.defaultAuthorStyle}" was not found in the library`);
    }

    return { styleId: '', source: 'none', sourceName: null };
}

// ============================================================================
// MIGRATION
// ============================================================================

/**
 * Migrate story types and author styles from old extension_settings storage.
 * Now writes through to File API (via saveStoryTypesToStorage / saveAuthorStylesToStorage).
 *
 * @async
 */
export async function migrateFromExtensionSettings() {
    // Migrate story types
    if (extension_settings[MODULE_NAME].storyTypes && extension_settings[MODULE_NAME].storyTypes.length > 0) {
        extension_settings[MODULE_NAME].storyTypes.forEach(customType => {
            const existing = storyTypes.findIndex(t => t.id === customType.id);
            if (existing >= 0) {
                storyTypes[existing] = customType;
            } else {
                storyTypes.push(customType);
            }
        });
        // Save to localForage and clear from extension_settings
        const savedTypes = await saveStoryTypesToStorage();
        if (savedTypes) {
            extension_settings[MODULE_NAME].storyTypes = [];
            saveSettingsDebounced();
        } else {
            console.warn('[Story Mode] Migration: Failed to save story types to localForage');
        }
    }

    // Migrate author styles
    if (extension_settings[MODULE_NAME].authorStyles && extension_settings[MODULE_NAME].authorStyles.length > 0) {
        extension_settings[MODULE_NAME].authorStyles.forEach(customStyle => {
            const existing = authorStyles.findIndex(s => s.id === customStyle.id);
            if (existing >= 0) {
                authorStyles[existing] = customStyle;
            } else {
                authorStyles.push(customStyle);
            }
        });
        // Save to localForage and clear from extension_settings
        const savedStyles = await saveAuthorStylesToStorage();
        if (savedStyles) {
            extension_settings[MODULE_NAME].authorStyles = [];
            saveSettingsDebounced();
        } else {
            console.warn('[Story Mode] Migration: Failed to save author styles to localForage');
        }
    }
}
