/**
 * Characters Editor Module
 * The Characters tab: the blueprint's protagonist group and `character_arcs`,
 * using the arc shape that blueprint generation produces.
 */

import { Popup } from '../adapters/popup-adapter.js';
import { showCharacterSearch } from './character-search-modal.js';
import { getCurrentBlueprint } from '../handlers/blueprint-actions.js';
import { isHostAvailable } from '../adapters/host-bridge.js';
import { getConnectionStatus } from '../adapters/connection-bridge.js';
import { buildForm, readForm } from './form-fields.js';

const ARC_FIELDS = [
    { key: 'character_name', label: 'Character Name', kind: 'text', required: true },
    { key: 'initial_state', label: 'Starting Point', kind: 'area', rows: 3, help: 'What they want, why, and what in them or around them stands in the way.' },
    { key: 'key_turning_points', label: 'Turning Points (one per line, in story order)', kind: 'lines', rows: 4, help: 'For the player\'s persona, write situations the story puts them in, not their decisions.' },
    { key: 'emotional_trajectory', label: 'Inner Change', kind: 'area', rows: 2 },
    { key: 'final_state', label: 'Possible Endpoints', kind: 'area', rows: 2 },
];

/**
 * Render the Characters tab content
 * @param {Object} blueprint - Blueprint object
 * @param {Object} options - { readonly }
 * @returns {jQuery}
 */
export function renderCharactersTab(blueprint, options = {}) {
    const { readonly = false } = options;
    const arcs = blueprint.character_arcs || [];
    const $content = $('<div>').addClass('characters-editor');

    const $header = $('<div>').addClass('tab-header');
    $header.append($('<h3>').text('Characters'));
    const $actions = $('<div>').addClass('tab-actions');
    $actions.append($('<span>').addClass('arc-count').text(`${arcs.length} character arc${arcs.length === 1 ? '' : 's'}`));
    $actions.append($('<button>').addClass('btn btn-primary').attr('data-action', 'add-arc').prop('disabled', readonly)
        .html('<i class="fa-solid fa-plus"></i> Add Character'));
    $header.append($actions);
    $content.append($header);

    const group = blueprint.protagonist_group;
    if (group?.description || group?.shared_goal) {
        const $group = $('<div>').addClass('arc-card protagonist-group');
        $group.append($('<h4>').text('Protagonist Group'));
        if (group.description) $group.append($('<p>').text(group.description));
        if (group.shared_goal) $group.append($('<p>').append($('<strong>').text('Shared goal: ')).append(document.createTextNode(group.shared_goal)));
        $group.append($('<small>').addClass('text-muted').text('Edit the group in the Details tab.'));
        $content.append($group);
    }

    const $list = $('<div>').addClass('arc-list');
    if (!arcs.length) {
        $list.append($('<div>').addClass('empty-state')
            .append($('<i>').addClass('fa-solid fa-user-tag'))
            .append($('<p>').text('No character arcs yet.')));
    } else {
        arcs.forEach((arc, index) => $list.append(renderArcCard(arc, index, readonly)));
    }
    $content.append($list);

    if (!readonly) bindCharactersEvents($content);
    return $content;
}

function renderArcCard(arc, index, readonly) {
    const $card = $('<div>').addClass('arc-card').attr('data-arc-index', index);
    const $header = $('<div>').addClass('arc-card-header');
    $header.append($('<h4>').addClass('character-name').text(arc.character_name || 'Unnamed Character'));
    $header.append($('<span>').addClass('badge badge-secondary').text(`${arc.key_turning_points?.length || 0} turning points`));
    $card.append($header);

    const $body = $('<div>').addClass('arc-card-body');
    if (arc.initial_state) $body.append($('<p>').addClass('arc-description').text(arc.initial_state));
    if (arc.key_turning_points?.length) {
        const $ol = $('<ol>').addClass('arc-progression');
        arc.key_turning_points.forEach(tp => $ol.append($('<li>').text(tp)));
        $body.append($ol);
    }
    $card.append($body);

    if (!readonly) {
        const $actions = $('<div>').addClass('arc-card-actions');
        $actions.append($('<button>').addClass('btn btn-sm btn-secondary').attr('data-action', 'edit-arc').html('<i class="fa-solid fa-pen"></i> Edit'));
        $actions.append($('<button>').addClass('btn btn-sm btn-danger').attr('data-action', 'delete-arc').html('<i class="fa-solid fa-trash"></i> Delete'));
        $card.append($actions);
    }
    return $card;
}

function bindCharactersEvents($content) {
    const indexOf = el => Number($(el).closest('.arc-card').attr('data-arc-index'));
    $content.on('click.characters-editor', '[data-action="add-arc"]', () => openArcEditModal(null));
    $content.on('click.characters-editor', '[data-action="edit-arc"]', function () { openArcEditModal(indexOf(this)); });
    $content.on('click.characters-editor', '[data-action="delete-arc"]', function () { deleteArc(indexOf(this)); });
}

function openArcEditModal(index) {
    const isNew = index === null;
    const blueprint = getCurrentBlueprint();
    const arc = isNew ? {} : (blueprint.character_arcs?.[index] || {});

    const $form = buildForm(ARC_FIELDS, arc);
    if (isHostAvailable() || getConnectionStatus()) {
        const $nameInput = $form.find('[data-key="character_name"]');
        $('<button type="button">').addClass('btn btn-sm btn-secondary').css('margin-top', '8px')
            .html('<i class="fa-solid fa-search"></i> Pick from SillyTavern characters')
            .on('click', () => showCharacterSearch($nameInput))
            .insertAfter($nameInput);
    }

    new Popup($form, 'TEXT', isNew ? 'Add Character' : 'Edit Character', { wide: true, okButton: true, cancelButton: true })
        .show()
        .then(result => {
            if (!result) return;
            const values = readForm($form);
            if (!values.character_name) return;
            blueprint.character_arcs = blueprint.character_arcs || [];
            if (isNew) blueprint.character_arcs.push(values);
            else blueprint.character_arcs[index] = { ...arc, ...values };
            $(document).trigger('blueprint:updated', { blueprint });
        });
}

function deleteArc(index) {
    const blueprint = getCurrentBlueprint();
    const arc = blueprint?.character_arcs?.[index];
    if (!arc) return;
    new Popup($('<p>').text(`Delete the arc for "${arc.character_name || 'this character'}"?`), 'TEXT', 'Delete Character Arc', { okButton: true, cancelButton: true })
        .show()
        .then(result => {
            if (!result) return;
            blueprint.character_arcs.splice(index, 1);
            $(document).trigger('blueprint:updated', { blueprint });
        });
}
