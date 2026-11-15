/**
 * Structure editor
 *
 * One editor for the blueprint's story structure (arcs, chapters, tentpoles,
 * complications, ending conditions and choice tags), shared by the
 * extension's blueprint editor and the standalone editor. It writes straight
 * into the blueprint object it is given and calls onChange after each edit.
 *
 * Needs jQuery; no SillyTavern imports.
 *
 *   const $el = renderStructureEditor(blueprint, { onChange, classes });
 *   container.append($el);
 *
 * @module editor/structure/structure-editor
 */

import { renderStructureHtml, DEFAULT_CLASSES } from './sections.js';
import {
    getPath,
    setPath,
    parseTags,
    parseLines,
    ensureArcs,
    setArcShape,
    addThread,
    removeThread,
    countStageReferences,
    createChapters,
    addChapter,
    removeChapter,
    moveChapter,
    setSceneChapter,
    toggleAdvance,
    fixArcConvergence,
    addTentpole,
    addComplication,
    removeListItem,
    cleanCondition,
} from './model.js';
import { getBlueprintArcs } from '../../story/arcs.js';

function readValue($el) {
    const kind = $el.attr('data-kind');
    if (kind === 'bool') return $el.is(':checked');
    const raw = $el.val() ?? '';
    switch (kind) {
        case 'lines': return parseLines(raw);
        case 'csv': { const tags = parseTags(raw); return tags.length ? tags : undefined; }
        case 'opt': return raw === '' ? undefined : raw;
        case 'int': return raw === '' ? undefined : parseInt(raw, 10);
        default: return raw;
    }
}

/**
 * Render the structure editor.
 * @param {Object} blueprint - Edited in place
 * @param {Object} [options]
 * @param {Function} [options.onChange] - (blueprint, info) after each edit
 * @param {Object} [options.classes] - { input, select, textarea, button, danger }
 * @param {Function} [options.confirm] - (message) => boolean|Promise<boolean>
 * @returns {jQuery}
 */
export function renderStructureEditor(blueprint, options = {}) {
    const classes = { ...DEFAULT_CLASSES, ...(options.classes || {}) };
    const onChange = options.onChange || (() => {});
    const confirmFn = options.confirm || (msg => window.confirm(msg));
    const openState = {};
    const $root = $('<div class="sm-structure"></div>');

    const render = () => {
        $root.find('details.sm-st-section').each(function () {
            openState[$(this).attr('data-section')] = this.open;
        });
        $root.html(renderStructureHtml(blueprint, classes, openState));
    };

    const changed = (info, rerender) => {
        onChange(blueprint, info);
        if (rerender) render();
    };

    // Field edits write straight through
    $root.on('input change', '[data-path]', function (e) {
        const $el = $(this);
        const kind = $el.attr('data-kind');
        // Text fields commit on input; lists and selects on change
        if (e.type === 'input' && !['text'].includes(kind)) return;
        const path = $el.attr('data-path');
        if (path.startsWith('arcs.')) ensureArcs(blueprint);
        setPath(blueprint, path, readValue($el));
        const cond = $el.attr('data-cond');
        if (cond) cleanCondition(blueprint, cond);
        // Conditions, tags and chapter titles feed the checks, badges and tag list
        const rerender = e.type === 'change' && (['opt', 'int', 'csv'].includes(kind) || path.startsWith('chapters.'));
        changed({ path }, rerender);
    });

    // Structural changes re-render
    $root.on('change', '[data-action]', async function () {
        const $el = $(this);
        const action = $el.attr('data-action');
        const index = parseInt($el.attr('data-index'), 10);
        if (action === 'arc-shape') {
            const arc = getBlueprintArcs(blueprint)[index];
            const refs = arc ? countStageReferences(blueprint, arc.id) : 0;
            if (refs && !(await confirmFn(`Changing this arc's shape removes ${refs} reference${refs === 1 ? '' : 's'} to its stages (chapters, tentpoles, conditions) and its stage notes. Continue?`))) {
                render();
                return;
            }
            setArcShape(blueprint, index, $el.val());
        } else if (action === 'scene-chapter') {
            setSceneChapter(blueprint, parseInt($el.attr('data-scene'), 10), parseInt($el.val(), 10));
        } else if (action === 'advance') {
            toggleAdvance(blueprint, parseInt($el.attr('data-chapter'), 10), $el.attr('data-key'), $el.is(':checked'));
        } else {
            return;
        }
        changed({ action }, true);
    });

    $root.on('click', 'button[data-action]', async function (e) {
        e.preventDefault();
        const $el = $(this);
        const action = $el.attr('data-action');
        const index = parseInt($el.attr('data-index'), 10);
        switch (action) {
            case 'add-thread': addThread(blueprint); break;
            case 'remove-thread': {
                const arc = getBlueprintArcs(blueprint)[index];
                const refs = arc ? countStageReferences(blueprint, arc.id) : 0;
                if (!(await confirmFn(`Remove this thread${refs ? ` and ${refs} reference${refs === 1 ? '' : 's'} to its stages` : ''}?`))) return;
                removeThread(blueprint, index);
                break;
            }
            case 'create-chapters': createChapters(blueprint); break;
            case 'add-chapter': addChapter(blueprint); break;
            case 'remove-chapter': removeChapter(blueprint, index); break;
            case 'chapter-up': moveChapter(blueprint, index, -1); break;
            case 'chapter-down': moveChapter(blueprint, index, 1); break;
            case 'fix-arcs': fixArcConvergence(blueprint); break;
            case 'add-tentpole': addTentpole(blueprint); break;
            case 'add-complication': addComplication(blueprint); break;
            case 'remove-item': {
                const list = $el.attr('data-list');
                const name = getPath(blueprint, `${list}.${index}.name`) || 'this item';
                if (!(await confirmFn(`Remove "${name}"?`))) return;
                removeListItem(blueprint, list, index);
                break;
            }
            default: return;
        }
        changed({ action }, true);
    });

    render();
    $root.data('refresh', render);
    return $root;
}
