/**
 * Blueprint Integration Module - Orchestrator
 *
 * Coordinates between all blueprint-related modules:
 * - blueprint-storage.js (PNG file format)
 * - library-adapter.js (File-based storage via /api/files/*)
 * - blueprint-merger.js (Character conflict resolution)
 * - blueprint-editor.js (Blueprint editing UI)
 *
 * This module provides a unified API for all blueprint operations,
 * handling the workflow between modules.
 *
 * @module blueprint-integration
 * @version 2.0.0
 */

// ============================================================================
// IMPORTS
// ============================================================================

import { getLibrary } from './library-adapter.js';
import { getMerger } from './merger.js';
import { decodeBlueprintFromPNG, isBlueprintPNG, generateCoverImage } from './storage.js';
import { openBlueprintEditor } from '../editor/blueprint-editor.js';
import { generateUUID, loadBlueprintOrThrow as loadBlueprintOrThrowUtil } from './utils.js';
import { checkMigrationNeeded, promptAndMigrate } from './migration.js';

// Re-export storage functions
export {
    decodeBlueprintFromPNG,
    isBlueprintPNG,
    generateCoverPrompt,
    generateCoverImage,
} from './storage.js';

// Re-export library classes (with compatible names)
export {
    getLibrary,
    FileBackedLibrary as BlueprintLibrary,
    FileBackedSearch as BlueprintSearch,
    FileBackedFolders as BlueprintFolders,
    FileBackedImporter as BlueprintImporter,
    FileBackedStats as PlayStatsTracker,
} from './library-adapter.js';

// Re-export merger classes
export {
    getMerger,
    BlueprintMerger,
    CharacterMerger,
} from './merger.js';

// Re-export editor function
export { openBlueprintEditor };

// CSS is loaded via @import in main style.css

// ============================================================================
// HELPERS
// ============================================================================

// Cached library instance to avoid repeated async calls
let _cachedLibrary = null;

/**
 * Get library instance with caching
 * @returns {Promise<BlueprintLibrary>} Cached library instance
 */
async function getLibraryCached() {
    if (!_cachedLibrary) {
        _cachedLibrary = await getLibrary();
    }
    return _cachedLibrary;
}

/**
 * Invalidate library cache (call after library operations)
 */
function invalidateLibraryCache() {
    _cachedLibrary = null;
}

/**
 * Helper to load blueprint or throw error
 */
async function loadBlueprintOrThrow(blueprintId) {
    const library = await getLibraryCached();
    return loadBlueprintOrThrowUtil(blueprintId, library.getBlueprint.bind(library));
}

/**
 * Helper to generate cover with error handling
 */
async function generateCoverIfNeeded(blueprint, shouldGenerate) {
    if (!shouldGenerate) return null;

    try {
        return await generateCoverImage(blueprint);
    } catch (error) {
        console.warn('[BlueprintIntegration] Cover generation failed:', error);
        return null;
    }
}

/**
 * Helper to handle optional editor workflow
 */
async function openEditorIfNeeded(blueprint, shouldOpen) {
    if (!shouldOpen) return blueprint;

    const edited = await openBlueprintEditor(blueprint);
    if (!edited) return blueprint; // User cancelled

    const library = await getLibraryCached();
    await library.saveBlueprint(edited);
    invalidateLibraryCache();
    return edited;
}

// ============================================================================
// MAIN WORKFLOWS
// ============================================================================

/**
 * Create a new blueprint and add it to the library
 */
export async function createBlueprint(blueprint, options = {}) {
    const { saveToLibrary = true, generateCover = false, openEditor = false } = options;

    // Ensure blueprint has required ID
    if (!blueprint.blueprint_id) {
        blueprint.blueprint_id = generateUUID();
    }

    // Generate cover if requested
    const coverImage = await generateCoverIfNeeded(blueprint, generateCover);
    if (coverImage) {
        blueprint.coverImage = coverImage;
    }

    // Save to library if requested
    if (saveToLibrary) {
        const library = await getLibraryCached();
        await library.saveBlueprint(blueprint);
        invalidateLibraryCache();
    }

    // Open editor if requested
    return openEditorIfNeeded(blueprint, openEditor);
}


/**
 * Import a blueprint from a PNG file
 * Uses importPNGFile to preserve original PNG bytes (no re-encoding)
 */
export async function importBlueprintFromPNG(file, options = {}) {
    const { saveToLibrary = true, openEditor = false, resolveCharacterConflicts = true } = options;

    // Verify and decode
    if (!(await isBlueprintPNG(file))) {
        throw new Error('Not a valid blueprint PNG file');
    }

    const blueprint = await decodeBlueprintFromPNG(file);

    // Resolve character conflicts if requested
    if (resolveCharacterConflicts) {
        const merger = getMerger();
        const result = await merger.mergeBlueprint(blueprint, {
            resolveCharacterConflicts: true,
            importStoryType: true,
            importAuthorStyle: true,
            syncSettings: false,
        });

        if (!result.success && result.errors.length > 0) {
            console.warn('[BlueprintIntegration] Import had errors:', result.errors);
        }
    }

    // Save to library - use importPNGFile to store original file directly
    if (saveToLibrary) {
        const library = await getLibraryCached();
        await library.importPNGFile(blueprint, file);
        invalidateLibraryCache();
    }

    // Open editor if requested
    return openEditorIfNeeded(blueprint, openEditor);
}


// ============================================================================
// LIBRARY MANAGEMENT
// ============================================================================

/**
 * Duplicate a blueprint in the library
 */
export async function duplicateBlueprint(blueprintId, newTitle = null) {
    const library = await getLibraryCached();
    const original = await loadBlueprintOrThrow(blueprintId);

    const duplicate = structuredClone(original);
    duplicate.blueprint_id = generateUUID();

    if (duplicate.userMetadata) {
        duplicate.userMetadata.title = newTitle || `${duplicate.userMetadata.title} (Copy)`;
    }

    // Reset library metadata
    if (duplicate.libraryData) {
        delete duplicate.libraryData.dateAdded;
        delete duplicate.libraryData.dateModified;
        delete duplicate.libraryData.lastAccessed;
        delete duplicate.libraryData.accessCount;
    }

    await library.saveBlueprint(duplicate);
    invalidateLibraryCache();
    return duplicate;
}

/**
 * Delete a blueprint from the library
 */
export async function deleteLibraryBlueprint(blueprintId) {
    const library = await getLibraryCached();
    await library.deleteBlueprint(blueprintId);
    invalidateLibraryCache();
}

/**
 * Search the blueprint library
 */
export async function searchBlueprints(query, options = {}) {
    const library = await getLibraryCached();
    return library.search.search(query, options);
}


/**
 * Record play progress
 */
export async function recordPlayProgress(blueprintId, currentStep, currentSceneIndex) {
    const library = await getLibraryCached();
    await library.stats.recordPlayProgress(blueprintId, currentStep, currentSceneIndex);
}

/**
 * Record play end
 */
export async function recordPlayEnd(blueprintId, completed, abandoned = false) {
    const library = await getLibraryCached();
    await library.stats.recordPlayEnd(blueprintId, completed, abandoned);
}

/**
 * Get recently played blueprints
 */
export async function getRecentlyPlayed(limit = 10) {
    const library = await getLibraryCached();
    return library.stats.getRecentlyPlayed(limit);
}

/**
 * Get most played blueprints
 */
export async function getMostPlayed(limit = 10) {
    const library = await getLibraryCached();
    return library.stats.getMostPlayed(limit);
}

/**
 * Favorite/unfavorite a blueprint
 * Uses direct setFavorite() for efficiency (doesn't reload entire blueprint)
 */
export async function setBlueprintFavorite(blueprintId, favorite) {
    const library = await getLibraryCached();
    await library.setFavorite(blueprintId, favorite);
    invalidateLibraryCache();
}


// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Get the current blueprint from blueprint state
 */
export async function getCurrentBlueprint() {
    try {
        return window.getBlueprintState ? await window.getBlueprintState() : null;
    } catch (error) {
        console.warn('[BlueprintIntegration] Could not get current blueprint:', error);
        return null;
    }
}

/**
 * Save the current blueprint to the library
 */
export async function saveCurrentBlueprintToLibrary(options = {}) {
    const { title = null, description = null, tags = [], generateCover = false, blueprint = null } = options;

    let current = blueprint;
    if (!current) {
        current = await getCurrentBlueprint();
    }

    if (!current) {
        throw new Error('No current blueprint to save');
    }

    // Add metadata
    current.userMetadata = current.userMetadata || {};
    if (title) current.userMetadata.title = title;
    if (description) current.userMetadata.description = description;
    if (tags.length > 0) current.userMetadata.tags = tags;

    return createBlueprint(current, { saveToLibrary: true, generateCover });
}

// ============================================================================
// LIFECYCLE
// ============================================================================

/**
 * Initialize the blueprint integration
 * Handles one-time migration from IndexedDB if needed
 */
export async function initBlueprintIntegration() {
    try {
        // Check for one-time migration from IndexedDB
        if (await checkMigrationNeeded()) {
            await promptAndMigrate();
        }

        const library = await getLibraryCached();
        getMerger(); // Initialize merger
        return { library, success: true };
    } catch (error) {
        console.error('[BlueprintIntegration] Initialization failed:', error);
        return { success: false, error };
    }
}

