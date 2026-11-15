/**
 * Library Storage Adapter for the Standalone Editor
 *
 * Thin wrapper over the extension's own library (lib/blueprint/library-adapter.js
 * and file-storage.js), loaded through the import-map shims in index.html.
 * Using the same code means the manifest and the blueprint PNGs are written
 * in exactly the format the extension reads.
 *
 * Every write is announced over the host bridge so an open SillyTavern tab
 * reloads its cached manifest instead of overwriting this tab's changes, and
 * changes made in SillyTavern reload ours.
 */

import { getLibrary, extractCoverAsCanvas } from '../../lib/blueprint/library-adapter.js';
import { reloadManifest } from '../../lib/blueprint/manifest.js';
import { importBlueprintFromPNG } from '../../lib/blueprint/file-storage.js';
import { notifyLibraryChanged, onHostEvent } from './host-bridge.js';

const changeListeners = new Set();

onHostEvent('library-changed', async () => {
    try {
        await reloadManifest();
    } catch (error) {
        console.warn('[LibraryStorage] Manifest reload failed:', error);
    }
    changeListeners.forEach(fn => fn());
});

/** Subscribe to library changes made in another tab. */
export function onLibraryChangedElsewhere(fn) {
    changeListeners.add(fn);
    return () => changeListeners.delete(fn);
}

function afterWrite() {
    notifyLibraryChanged();
}

/**
 * @returns {Promise<Array>} Card-format entries (title, cover URL, favorite, dates)
 */
export async function getAllBlueprints() {
    const library = await getLibrary();
    return library.getAllBlueprints({ sortBy: 'modified', sortOrder: 'desc' });
}

/**
 * Load a full blueprint. Its stored PNG doubles as the cover image, so the
 * URL is kept on the object; saving re-embeds it unless a new cover is chosen.
 * @param {string} blueprintId
 * @returns {Promise<Object|null>}
 */
export async function getBlueprintById(blueprintId) {
    const library = await getLibrary();
    const blueprint = await library.getBlueprint(blueprintId);
    if (blueprint) {
        const entry = (await library.getAllBlueprints()).find(b => b.blueprint_id === blueprintId);
        if (entry?.coverFileUrl && !blueprint.metadata?.coverGallery?.length) {
            blueprint.coverFileUrl = entry.coverFileUrl;
        }
    }
    return blueprint;
}

/**
 * Save (create or update) a blueprint in the shared library.
 * @param {Object} blueprint
 */
export async function saveBlueprint(blueprint) {
    const library = await getLibrary();
    await library.saveBlueprint(blueprint);
    afterWrite();
}

/** @param {string} blueprintId */
export async function deleteBlueprint(blueprintId) {
    const library = await getLibrary();
    await library.deleteBlueprint(blueprintId);
    afterWrite();
}

/**
 * @param {string} blueprintId
 * @param {boolean} favorite
 */
export async function setFavorite(blueprintId, favorite) {
    const library = await getLibrary();
    await library.setFavorite(blueprintId, favorite);
    const { flushManifest } = await import('../../lib/blueprint/manifest.js');
    await flushManifest();
    afterWrite();
}

/**
 * Import a blueprint PNG into the library, keeping the original bytes.
 * @param {File} file
 * @returns {Promise<Object|null>} Imported blueprint, or null if cancelled
 */
export async function importPngToLibrary(file) {
    await getLibrary();
    const blueprint = await importBlueprintFromPNG(file);
    if (blueprint) afterWrite();
    return blueprint;
}

export { extractCoverAsCanvas };
