/**
 * Cover gallery model for the standalone editor.
 *
 * Uses the same fields as the extension's editor and the PNG codec
 * (lib/editor/blueprint-editor/cover-gallery.js, lib/blueprint/codec.js):
 *   blueprint.metadata.coverGallery      [{ id, url, prompt, generatedAt, source }]
 *   blueprint.metadata.coverGalleryIndex selected index
 *   blueprint.metadata.coverImageUrl / blueprint.coverImageUrl  selected URL
 * A blueprint loaded from the library also carries `coverFileUrl`, the
 * stored PNG itself, which is the cover when the gallery is empty.
 */

const MAX_GALLERY_SIZE = 10;

function ensureMetadata(blueprint) {
    blueprint.metadata = blueprint.metadata || {};
    // Migrate covers added by earlier standalone builds (blueprint.covers / blueprint.cover)
    if (Array.isArray(blueprint.covers) && blueprint.covers.length) {
        const gallery = blueprint.metadata.coverGallery || [];
        for (const url of blueprint.covers) {
            if (typeof url === 'string' && !gallery.some(c => c.url === url)) {
                gallery.push({ id: crypto.randomUUID(), url, prompt: null, generatedAt: new Date().toISOString(), source: 'upload' });
            }
        }
        blueprint.metadata.coverGallery = gallery;
        const selected = gallery.findIndex(c => c.url === blueprint.cover);
        if (selected >= 0) blueprint.metadata.coverGalleryIndex = selected;
    }
    delete blueprint.covers;
    delete blueprint.cover;
    blueprint.metadata.coverGallery = blueprint.metadata.coverGallery || [];
    return blueprint.metadata;
}

function syncSelected(blueprint) {
    const meta = blueprint.metadata;
    const item = meta.coverGallery[meta.coverGalleryIndex];
    const url = item?.url || null;
    meta.coverImageUrl = url;
    blueprint.coverImageUrl = url;
}

/** @returns {Array<Object>} Gallery items */
export function getGallery(blueprint) {
    return ensureMetadata(blueprint).coverGallery;
}

/** @returns {number|null} Selected gallery index */
export function getSelectedIndex(blueprint) {
    const meta = ensureMetadata(blueprint);
    return typeof meta.coverGalleryIndex === 'number' && meta.coverGallery[meta.coverGalleryIndex]
        ? meta.coverGalleryIndex
        : null;
}

/** @returns {string|null} URL of the cover currently in effect */
export function getCurrentCoverUrl(blueprint) {
    const index = getSelectedIndex(blueprint);
    if (index !== null) return getGallery(blueprint)[index].url;
    return blueprint.coverImageUrl || blueprint.metadata?.coverImageUrl || blueprint.coverFileUrl || null;
}

/** Add a cover, select it, and trim the gallery to its size limit. */
export function addCover(blueprint, url, { prompt = null, source = 'upload' } = {}) {
    const meta = ensureMetadata(blueprint);
    while (meta.coverGallery.length >= MAX_GALLERY_SIZE) meta.coverGallery.shift();
    meta.coverGallery.push({ id: crypto.randomUUID(), url, prompt, generatedAt: new Date().toISOString(), source });
    meta.coverGalleryIndex = meta.coverGallery.length - 1;
    syncSelected(blueprint);
}

/** Select a gallery item as the cover. */
export function selectCover(blueprint, index) {
    const meta = ensureMetadata(blueprint);
    if (!meta.coverGallery[index]) return;
    meta.coverGalleryIndex = index;
    syncSelected(blueprint);
}

/** Remove a gallery item; selection moves to a neighbour if it was selected. */
export function deleteCover(blueprint, index) {
    const meta = ensureMetadata(blueprint);
    if (!meta.coverGallery[index]) return;
    meta.coverGallery.splice(index, 1);
    if (meta.coverGalleryIndex === index) {
        meta.coverGalleryIndex = meta.coverGallery.length ? Math.min(index, meta.coverGallery.length - 1) : null;
    } else if (meta.coverGalleryIndex > index) {
        meta.coverGalleryIndex -= 1;
    }
    syncSelected(blueprint);
}

/** Clear the selected cover (the default generated cover will be used on save). */
export function clearCover(blueprint) {
    const meta = ensureMetadata(blueprint);
    meta.coverGalleryIndex = null;
    syncSelected(blueprint);
    delete blueprint.coverFileUrl;
}
