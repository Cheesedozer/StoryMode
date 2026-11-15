/**
 * Blueprint Action Handlers
 * Create, open, save, import and export blueprints, and track unsaved changes.
 *
 * PNG encoding/decoding and library storage use the extension's own modules
 * (lib/blueprint/codec.js, library-adapter.js) so files are interchangeable.
 */

import { showSuccess, showError, showWarning } from '../adapters/notification-adapter.js';
import { encodeBlueprintAsPNG, decodeBlueprintFromPNG } from '../../lib/blueprint/codec.js';
import { createBlankBlueprint } from '../../lib/blueprint/blank-blueprint.js';
import { saveBlueprint, importPngToLibrary, extractCoverAsCanvas } from '../adapters/library-storage-adapter.js';
import { getConnectionStatus } from '../adapters/connection-bridge.js';
import { switchTab } from '../ui/routing.js';
import { hideLibrary } from '../ui/library-view.js';

// ============================================================================
// STATE
// ============================================================================

let currentBlueprint = null;
let dirty = false;

// Any edit in any tab marks the blueprint as changed
$(document).on('blueprint:updated.blueprint-actions blueprint:edited.blueprint-actions', () => markDirty());

// Warn before closing the tab with unsaved changes
window.addEventListener('beforeunload', (e) => {
    if (dirty) {
        e.preventDefault();
        e.returnValue = '';
    }
});

/** @returns {Object|null} Current blueprint */
export function getCurrentBlueprint() {
    return currentBlueprint;
}

/**
 * Set the current blueprint (e.g. opened from the library or generated).
 * @param {Object|null} blueprint
 * @param {Object} [options]
 * @param {boolean} [options.dirty=false] - Whether it still needs saving
 */
export function setCurrentBlueprint(blueprint, { dirty: isDirty = false } = {}) {
    currentBlueprint = blueprint;
    dirty = isDirty;
    updateSaveIndicator();
}

/** @returns {boolean} True if there are changes not yet saved to the library */
export function hasUnsavedChanges() {
    return dirty;
}

/** Mark the current blueprint as changed. */
export function markDirty() {
    if (!currentBlueprint) return;
    dirty = true;
    updateSaveIndicator();
}

function updateSaveIndicator() {
    $('#saveLink').toggleClass('has-changes', dirty);
    $('#saveLink .unsaved-dot').toggle(dirty);
}

function confirmDiscard(action) {
    return !dirty || window.confirm(`You have unsaved changes. ${action} anyway?`);
}

// ============================================================================
// ACTIONS
// ============================================================================

function openBlueprint(blueprint, { isDirty = false } = {}) {
    setCurrentBlueprint(blueprint, { dirty: isDirty });
    $(document).trigger('blueprint:loaded', { blueprint });
    hideLibrary();
    updateUIState();
    switchTab('details');
}

/**
 * Create a new blank blueprint (unsaved until Save).
 * @returns {boolean}
 */
export function handleNewBlueprint() {
    if (!confirmDiscard('Create a new blueprint')) return false;
    openBlueprint(createBlankBlueprint(), { isDirty: true });
    showSuccess('New blueprint created. Use Save to add it to your library.');
    return true;
}

/** Open the file picker for importing a blueprint PNG. */
export function handleImport() {
    $('#fileInput').click();
}

/**
 * Import a blueprint PNG: into the library when connected (original bytes
 * kept), otherwise just open it in the editor.
 * @param {Event} e - File input change event
 */
export async function handleFileSelect(e) {
    const file = e.target.files[0];
    $('#fileInput').val('');
    if (!file) return;

    if (file.type !== 'image/png') {
        showError('Please select a PNG file');
        return;
    }
    if (!confirmDiscard('Import')) return;

    try {
        if (getConnectionStatus() === 'connected') {
            const blueprint = await importPngToLibrary(file);
            if (!blueprint) return; // cancelled in the duplicate dialog
            openBlueprint(blueprint);
            showSuccess('Blueprint imported into your library');
        } else {
            const blueprint = await decodeBlueprintFromPNG(file);
            blueprint.userMetadata = blueprint.userMetadata || {};
            openBlueprint(blueprint, { isDirty: true });
            showSuccess('Blueprint opened (not connected, so it was not added to the library)');
        }
    } catch (error) {
        console.error('[Blueprint] Import failed:', error);
        if (error.message?.includes('does not contain blueprint data')) {
            showError('This PNG file does not contain a blueprint.');
        } else {
            showError(`Import failed: ${error.message}`);
        }
    }
}

/**
 * Save the current blueprint to the shared library.
 * @returns {Promise<boolean>}
 */
export async function handleSave() {
    if (!currentBlueprint) {
        showWarning('No blueprint to save');
        return false;
    }
    if (getConnectionStatus() !== 'connected') {
        showError('Not connected to SillyTavern, so the library is unavailable. Use Export PNG to keep a copy.');
        return false;
    }

    try {
        await saveBlueprint(currentBlueprint);
        dirty = false;
        updateSaveIndicator();
        $(document).trigger('library:changed');
        showSuccess('Saved to library');
        return true;
    } catch (error) {
        console.error('[Blueprint] Save failed:', error);
        showError(`Save failed: ${error.message}`);
        return false;
    }
}

/**
 * Download the current blueprint as a PNG (same format as the extension's export).
 * @returns {Promise<boolean>}
 */
export async function handleExport() {
    if (!currentBlueprint) {
        showWarning('No blueprint to export');
        return false;
    }

    try {
        const cover = await extractCoverAsCanvas(currentBlueprint);
        const pngBlob = await encodeBlueprintAsPNG(currentBlueprint, cover);
        const title = currentBlueprint.userMetadata?.title || currentBlueprint.blueprint_title || 'blueprint';
        downloadBlob(pngBlob, `${title.replace(/[^a-z0-9]+/gi, '_')}-${currentBlueprint.blueprint_id}.png`);
        showSuccess('Blueprint exported as PNG');
        return true;
    } catch (error) {
        console.error('[Blueprint] Export failed:', error);
        showError(`Export failed: ${error.message}`);
        return false;
    }
}

/**
 * Download the current blueprint as JSON.
 * @returns {boolean}
 */
export function handleJsonExport() {
    if (!currentBlueprint) {
        showWarning('No blueprint to export');
        return false;
    }
    const blob = new Blob([JSON.stringify(currentBlueprint, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `blueprint-${currentBlueprint.blueprint_id}.json`);
    showSuccess('Blueprint exported as JSON');
    return true;
}

// ============================================================================
// UI STATE
// ============================================================================

/**
 * Update the overall UI state based on whether a blueprint is loaded
 * @param {boolean} [hasBlueprint]
 */
export function updateUIState(hasBlueprint) {
    if (hasBlueprint === undefined) {
        hasBlueprint = !!currentBlueprint;
    }

    $('#emptyState').toggle(!hasBlueprint);
    $('.sidebar-link[data-tab]').toggle(hasBlueprint);
    $('.requires-blueprint').toggle(hasBlueprint);

    const title = currentBlueprint?.userMetadata?.title || currentBlueprint?.blueprint_title;
    document.title = title
        ? `${title} - Story Mode Scenario Blueprint Editor`
        : 'Story Mode Scenario Blueprint Editor';

    updateSaveIndicator();
    $(document).trigger('ui:state-changed', { hasBlueprint });
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
