/**
 * Structure tab for the standalone editor.
 *
 * Mounts the shared structure editor (lib/editor/structure), which edits the
 * blueprint's arcs, chapters, tentpoles, complications, ending conditions and
 * choice tags in place. Edits announce 'blueprint:edited' so the unsaved
 * marker and Save work as for the other tabs.
 */

import { renderStructureEditor } from '../../lib/editor/structure/structure-editor.js';
import { confirm as confirmDialog } from '../adapters/popup-adapter.js';

/**
 * @param {Object} blueprint
 * @param {Object} options - { readonly }
 * @returns {jQuery}
 */
export function renderStructureTab(blueprint, options = {}) {
    const $wrap = $('<div>').addClass('structure-editor-tab');
    $wrap.append($('<h2>').text('Story Structure'));
    const $editor = renderStructureEditor(blueprint, {
        classes: { input: 'form-control', select: 'form-control', textarea: 'form-control', button: 'btn btn-sm btn-secondary', danger: 'btn-danger' },
        confirm: async message => !!(await confirmDialog(message)),
        onChange: (bp, info) => $(document).trigger('blueprint:edited', { blueprint: bp, path: info?.path || 'structure' }),
    });
    if (options.readonly) $editor.find('input, select, textarea, button').prop('disabled', true);
    return $wrap.append($editor);
}
