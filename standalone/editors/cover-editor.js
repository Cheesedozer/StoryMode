/**
 * Cover Editor Module
 * Handles cover image management and the Cover tab
 */

import { showSuccess, showInfo, showError } from '../adapters/notification-adapter.js';
import { generateCover } from '../adapters/connection-bridge.js';
import { isHostAvailable } from '../adapters/host-bridge.js';
import { openUploadModal, uploadCoverFile } from './cover-upload-modal.js';
import { openGenerateModal } from './cover-generate-modal.js';
import { getCurrentBlueprint, markDirty } from '../handlers/blueprint-actions.js';
import * as Covers from './cover-model.js';

// ============================================================================
// COVER TAB RENDERING
// ============================================================================

/**
 * Render the Cover tab content
 * @param {Object} blueprint - Blueprint object
 * @param {Object} options - Options object
 * @returns {jQuery} Cover tab content
 */
export function renderCoverTab(blueprint, options = {}) {
    const { readonly = false } = options;
    const covers = Covers.getGallery(blueprint);
    const selectedIndex = Covers.getSelectedIndex(blueprint);
    const currentCover = Covers.getCurrentCoverUrl(blueprint);

    const $content = $('<div>').addClass('cover-editor');

    // Header
    const $header = $('<div>').addClass('tab-header');
    $header.append($('<h3>').text('Cover Image'));

    const $actions = $('<div>').addClass('tab-actions');
    $actions.append($('<button>')
        .addClass('btn btn-secondary')
        .attr('data-action', 'upload-cover')
        .html('<i class="fa-solid fa-upload"></i> Upload Cover')
        .prop('disabled', readonly));

    // Generate button (needs an open SillyTavern tab for the image source)
    if (isHostAvailable() && !readonly) {
        $actions.append($('<button>')
            .addClass('btn btn-primary')
            .attr('data-action', 'generate-cover')
            .html('<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Cover'));
    }

    $header.append($actions);
    $content.append($header);

    // Current cover display
    if (currentCover) {
        const $current = $('<div>').addClass('current-cover');
        $current.append($('<h4>').text('Current Cover'));
        const $img = $('<img>').addClass('cover-image-main').attr('src', currentCover);
        $current.append($img);

        if (!readonly) {
            const $removeBtn = $('<button>')
                .addClass('btn btn-sm btn-danger')
                .attr('data-action', 'remove-cover')
                .html('<i class="fa-solid fa-trash"></i> Remove Current Cover');
            $current.append($removeBtn);
        }

        $content.append($current);
    } else {
        const $noCover = $('<div>').addClass('no-cover');
        $noCover.append($('<i>').addClass('fa-solid fa-image'));
        $noCover.append($('<p>').text('No cover image set'));
        $content.append($noCover);
    }

    // Gallery section
    const $gallery = $('<div>').addClass('cover-gallery');
    $gallery.append($('<h4>').text(`Cover Gallery (${covers.length} images)`));

    if (covers.length === 0) {
        $gallery.append($('<p>').addClass('text-muted').text('No cover images in gallery.'));
    } else {
        const $grid = $('<div>').addClass('cover-grid');
        covers.forEach((cover, index) => {
            $grid.append(renderGalleryThumbnail(cover.url, index, index === selectedIndex, readonly));
        });
        $gallery.append($grid);
    }

    $content.append($gallery);

    // Bind events
    bindCoverEvents($content, readonly);

    return $content;
}

/**
 * Render a gallery thumbnail
 * @param {string} coverUrl - Cover image URL
 * @param {number} index - Cover index
 * @param {boolean} isCurrent - Whether this is the current cover
 * @param {boolean} readonly - Whether thumbnail is readonly
 * @returns {jQuery} Thumbnail element
 */
function renderGalleryThumbnail(coverUrl, index, isCurrent, readonly) {
    const $thumb = $('<div>').addClass('cover-thumbnail');
    if (isCurrent) $thumb.addClass('is-current');

    const $img = $('<img>').attr('src', coverUrl);
    $thumb.append($img);

    if (isCurrent) {
        $thumb.append($('<span>').addClass('current-badge').text('Current'));
    }

    if (!readonly) {
        const $actions = $('<div>').addClass('thumbnail-actions');

        if (!isCurrent) {
            const $setBtn = $('<button>')
                .addClass('btn btn-sm btn-primary')
                .attr('data-action', 'set-cover')
                .attr('data-index', index)
                .html('<i class="fa-solid fa-check"></i> Set as Cover');
            $actions.append($setBtn);
        }

        const $deleteBtn = $('<button>')
            .addClass('btn btn-sm btn-danger')
            .attr('data-action', 'delete-cover')
            .attr('data-index', index)
            .html('<i class="fa-solid fa-trash"></i>');

        $actions.append($deleteBtn);
        $thumb.append($actions);
    }

    return $thumb;
}

// ============================================================================
// EVENT BINDING
// ============================================================================

/**
 * Bind events for the Cover tab
 * @param {jQuery} $content - Content element
 * @param {boolean} readonly - Whether tab is readonly
 */
function bindCoverEvents($content, readonly) {
    if (readonly) return;

    // Upload cover button
    $content.on('click.cover-editor', '[data-action="upload-cover"]', function() {
        handleUploadClick();
    });

    // Generate cover button
    $content.on('click.cover-editor', '[data-action="generate-cover"]', function() {
        handleGenerateClick();
    });

    // Remove current cover
    $content.on('click.cover-editor', '[data-action="remove-cover"]', function() {
        removeCurrentCover();
    });

    // Set as cover from gallery
    $content.on('click.cover-editor', '[data-action="set-cover"]', function() {
        const index = $(this).data('index');
        setCurrentCover(index);
    });

    // Delete cover from gallery
    $content.on('click.cover-editor', '[data-action="delete-cover"]', function() {
        const index = $(this).data('index');
        deleteCover(index);
    });
}

// ============================================================================
// COVER OPERATIONS
// ============================================================================

/**
 * Handle upload button click
 */
function handleUploadClick() {
    openUploadModal((file) => {
        uploadCoverFile(file, addCoverToBlueprint);
    });
}

/**
 * Handle generate button click
 */
function handleGenerateClick() {
    const blueprint = getCurrentBlueprint();
    if (!blueprint) {
        showError('No blueprint loaded. Please create or load a blueprint first.');
        return;
    }
    openGenerateModal(blueprint, (params) => {
        generateCoverFromApi(blueprint, params);
    });
}

/**
 * Generate a cover in the open SillyTavern tab, with its image source
 * @param {Object} blueprint - Blueprint object
 * @param {Object} params - { prompt, negative_prompt } from the generate modal
 */
async function generateCoverFromApi(blueprint, params) {
    try {
        showInfo('Generating cover image... This may take 30-60 seconds.');
        const imageUrl = await generateCover(blueprint, params.prompt, params.negative_prompt);
        Covers.addCover(blueprint, imageUrl, { prompt: params.prompt || null, source: 'generated' });
        coverChanged(blueprint);
        showSuccess('Cover generated successfully!');
    } catch (error) {
        console.error('[Cover Editor] Generation failed:', error);
        showError('Failed to generate cover: ' + error.message);
    }
}

function coverChanged(blueprint) {
    markDirty();
    $(document).trigger('blueprint:updated', { blueprint });
    $(document).trigger('cover:changed', { cover: Covers.getCurrentCoverUrl(blueprint) });
}

/**
 * Add an uploaded cover (data URL) to the blueprint
 * @param {string} coverData - Image data URL
 */
function addCoverToBlueprint(coverData) {
    const blueprint = getCurrentBlueprint();
    if (!blueprint) return;
    Covers.addCover(blueprint, coverData, { source: 'upload' });
    coverChanged(blueprint);
}

/**
 * Set the current cover from gallery
 * @param {number} index - Cover index
 */
function setCurrentCover(index) {
    const blueprint = getCurrentBlueprint();
    if (!blueprint) return;
    Covers.selectCover(blueprint, index);
    coverChanged(blueprint);
}

/**
 * Delete a cover from the gallery
 * @param {number} index - Cover index
 */
function deleteCover(index) {
    const blueprint = getCurrentBlueprint();
    if (!blueprint) return;
    Covers.deleteCover(blueprint, index);
    coverChanged(blueprint);
}

/**
 * Remove the current cover (a default cover is generated on save)
 */
function removeCurrentCover() {
    const blueprint = getCurrentBlueprint();
    if (!blueprint) return;
    Covers.clearCover(blueprint);
    coverChanged(blueprint);
}

// ============================================================================
// EXPORT FOR DEBUGGING
// ============================================================================

if (typeof window !== 'undefined') {
    window.StoryModeCoverEditor = {
        renderCoverTab,
        addCoverToBlueprint,
        setCurrentCover,
        deleteCover,
        removeCurrentCover,
    };
}
