/**
 * Scenes Editor Module
 * The Scenes tab: list, add, edit, reorder and delete scenes of `scene_plan`,
 * using the same scene shape that blueprint generation produces.
 */

import { Popup } from '../adapters/popup-adapter.js';
import { getCurrentBlueprint } from '../handlers/blueprint-actions.js';
import { DROPDOWN_OPTIONS } from '../../lib/blueprint/schema.js';
import { CORE_BEAT_TYPES } from '../../lib/blueprint/utils.js';
import { PHASE_LABELS, normalizePhase } from '../../lib/core/phases.js';
import { buildForm, readForm } from './form-fields.js';

const SCENE_FIELDS = [
    { key: 'title', label: 'Title', kind: 'text', required: true },
    { key: 'phase', label: 'Phase', kind: 'select', options: DROPDOWN_OPTIONS.scenePhase },
    { key: 'purpose', label: 'Scene Goal', kind: 'area', rows: 2, help: 'What must be settled by the end of the scene. Also used as the scene\'s exit condition during play.' },
    { key: 'situation', label: 'Situation', kind: 'area', rows: 3, help: 'Where the protagonist is, what they want now, and what opposes them.' },
    { key: 'key_events_if_unchallenged', label: 'If the protagonist doesn\'t intervene (one per line)', kind: 'lines', rows: 4 },
    { key: 'hooks_for_future', label: 'Threads for later scenes (one per line)', kind: 'lines', rows: 3 },
];

const BEAT_TYPE_OPTIONS = CORE_BEAT_TYPES.map(t => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }));

// ============================================================================
// TAB
// ============================================================================

/**
 * Render the Scenes tab content
 * @param {Object} blueprint - Blueprint object
 * @param {Object} options - { readonly }
 * @returns {jQuery}
 */
export function renderScenesTab(blueprint, options = {}) {
    const { readonly = false } = options;
    const scenes = blueprint.scene_plan || [];
    const $content = $('<div>').addClass('scenes-editor');

    const $header = $('<div>').addClass('tab-header');
    $header.append($('<h3>').text('Scenes'));
    const $actions = $('<div>').addClass('tab-actions');
    $actions.append($('<span>').addClass('scene-count').text(`${scenes.length} scene${scenes.length === 1 ? '' : 's'}`));
    $actions.append($('<button>').addClass('btn btn-primary').attr('data-action', 'add-scene').prop('disabled', readonly)
        .html('<i class="fa-solid fa-plus"></i> Add Scene'));
    $header.append($actions);
    $content.append($header);

    const $list = $('<div>').addClass('scene-list');
    if (!scenes.length) {
        $list.append($('<div>').addClass('empty-state')
            .append($('<i>').addClass('fa-solid fa-layer-group'))
            .append($('<p>').text('No scenes yet. Add scenes to structure the story.')));
    } else {
        scenes.forEach((scene, index) => $list.append(renderSceneCard(scene, index, scenes.length, readonly)));
    }
    $content.append($list);

    if (!readonly) bindScenesEvents($content);
    return $content;
}

function renderSceneCard(scene, index, total, readonly) {
    const $card = $('<div>').addClass('scene-card').attr('data-scene-index', index);
    const phase = normalizePhase(scene.phase);

    const $header = $('<div>').addClass('scene-card-header');
    $header.append($('<span>').addClass('scene-number').text(`Scene ${index + 1}`));
    $header.append($('<span>').addClass(`scene-phase phase-${phase}`).text(PHASE_LABELS[phase]));
    $header.append($('<span>').addClass('scene-beat').text(`${scene.beats?.length || 0} beats`));
    $card.append($header);

    const $body = $('<div>').addClass('scene-card-body');
    $body.append($('<h4>').addClass('scene-title').text(scene.title || 'Untitled'));
    if (scene.purpose) $body.append($('<p>').addClass('scene-description').append($('<strong>').text('Goal: ')).append(document.createTextNode(scene.purpose)));
    if (scene.situation) $body.append($('<p>').addClass('scene-description text-muted').text(scene.situation));
    $card.append($body);

    if (!readonly) {
        const $actions = $('<div>').addClass('scene-card-actions');
        $actions.append($('<button>').addClass('btn btn-sm btn-secondary').attr({ 'data-action': 'move-scene', 'data-dir': '-1', title: 'Move up' })
            .prop('disabled', index === 0).html('<i class="fa-solid fa-arrow-up"></i>'));
        $actions.append($('<button>').addClass('btn btn-sm btn-secondary').attr({ 'data-action': 'move-scene', 'data-dir': '1', title: 'Move down' })
            .prop('disabled', index === total - 1).html('<i class="fa-solid fa-arrow-down"></i>'));
        $actions.append($('<button>').addClass('btn btn-sm btn-secondary').attr('data-action', 'edit-scene').html('<i class="fa-solid fa-pen"></i> Edit'));
        $actions.append($('<button>').addClass('btn btn-sm btn-danger').attr('data-action', 'delete-scene').html('<i class="fa-solid fa-trash"></i> Delete'));
        $card.append($actions);
    }
    return $card;
}

function bindScenesEvents($content) {
    const indexOf = el => Number($(el).closest('.scene-card').attr('data-scene-index'));
    $content.on('click.scenes-editor', '[data-action="add-scene"]', () => openSceneEditModal(null));
    $content.on('click.scenes-editor', '[data-action="edit-scene"]', function () { openSceneEditModal(indexOf(this)); });
    $content.on('click.scenes-editor', '[data-action="delete-scene"]', function () { deleteScene(indexOf(this)); });
    $content.on('click.scenes-editor', '[data-action="move-scene"]', function () {
        const from = indexOf(this);
        reorderScenes(from, from + Number($(this).attr('data-dir')));
    });
}

// ============================================================================
// BEATS SUB-EDITOR
// ============================================================================

function renderBeatRow(beat = {}) {
    const $row = $('<div>').addClass('beat-row');
    const $type = $('<select>').addClass('form-control beat-type');
    BEAT_TYPE_OPTIONS.forEach(o => $type.append($('<option>').val(o.value).text(o.label)));
    $type.val(BEAT_TYPE_OPTIONS.some(o => o.value === beat.type) ? beat.type : 'reaction');
    $row.append($('<input type="text">').addClass('form-control beat-title').attr('placeholder', 'Beat title').val(beat.title || ''));
    $row.append($type);
    $row.append($('<textarea>').addClass('form-control beat-description').attr({ rows: 2, placeholder: 'What happens: an event, another character\'s action, or a revelation' }).val(beat.description || ''));
    $row.append($('<button type="button">').addClass('btn btn-sm btn-danger beat-remove').attr('title', 'Remove beat').html('<i class="fa-solid fa-xmark"></i>'));
    $row.data('original', beat);
    return $row;
}

function buildBeatsEditor(beats = []) {
    const $wrap = $('<div>').addClass('form-group beats-editor');
    $wrap.append($('<label>').text('Beats (milestones in order)'));
    const $rows = $('<div>').addClass('beat-rows');
    beats.forEach(b => $rows.append(renderBeatRow(b)));
    $wrap.append($rows);
    $wrap.append($('<button type="button">').addClass('btn btn-sm btn-secondary beat-add').html('<i class="fa-solid fa-plus"></i> Add Beat'));
    $wrap.on('click', '.beat-add', () => $rows.append(renderBeatRow()));
    $wrap.on('click', '.beat-remove', function () { $(this).closest('.beat-row').remove(); });
    return $wrap;
}

function readBeats($wrap) {
    return $wrap.find('.beat-row').map(function (i) {
        const $row = $(this);
        const title = $row.find('.beat-title').val().trim();
        if (!title) return null;
        return {
            ...($row.data('original') || {}),
            index: i,
            title,
            type: $row.find('.beat-type').val(),
            description: $row.find('.beat-description').val().trim(),
            required: $row.data('original')?.required ?? true,
        };
    }).get().filter(Boolean);
}

// ============================================================================
// CRUD
// ============================================================================

function openSceneEditModal(index) {
    const isNew = index === null;
    const blueprint = getCurrentBlueprint();
    const scene = isNew ? {} : (blueprint.scene_plan?.[index] || {});

    const $content = $('<div>').addClass('scene-edit-form');
    const $form = buildForm(SCENE_FIELDS, { ...scene, phase: normalizePhase(scene.phase) });
    const $beats = buildBeatsEditor(scene.beats || []);
    $content.append($form, $beats);

    new Popup($content, 'TEXT', isNew ? 'Add Scene' : 'Edit Scene', { wide: true, large: true, okButton: true, cancelButton: true })
        .show()
        .then(result => {
            if (!result) return;
            const values = readForm($form);
            if (!values.title) values.title = `Scene ${(isNew ? blueprint.scene_plan?.length || 0 : index) + 1}`;
            // Merge so fields this form doesn't show (choice points, character focus, ...) survive
            saveScene(index, { ...scene, ...values, beats: readBeats($beats) });
        });
}

function renumber(scenes) {
    scenes.forEach((s, i) => { s.index = i; });
}

function changed(blueprint) {
    renumber(blueprint.scene_plan);
    $(document).trigger('blueprint:updated', { blueprint });
}

/**
 * Save a scene (add or update)
 * @param {number|null} index - Scene index (null for new)
 * @param {Object} sceneData - Complete scene object
 */
function saveScene(index, sceneData) {
    const blueprint = getCurrentBlueprint();
    if (!blueprint) return;
    blueprint.scene_plan = blueprint.scene_plan || [];
    if (index === null) {
        blueprint.scene_plan.push({ choice_points: [], character_focus: [], ...sceneData });
    } else {
        blueprint.scene_plan[index] = sceneData;
    }
    changed(blueprint);
}

function deleteScene(index) {
    const blueprint = getCurrentBlueprint();
    const scene = blueprint?.scene_plan?.[index];
    if (!scene) return;
    new Popup($('<p>').text(`Delete "${scene.title || `Scene ${index + 1}`}"?`), 'TEXT', 'Delete Scene', { okButton: true, cancelButton: true })
        .show()
        .then(result => {
            if (!result) return;
            blueprint.scene_plan.splice(index, 1);
            changed(blueprint);
        });
}

/**
 * Move a scene
 * @param {number} fromIndex
 * @param {number} toIndex
 */
export function reorderScenes(fromIndex, toIndex) {
    const blueprint = getCurrentBlueprint();
    const scenes = blueprint?.scene_plan;
    if (!scenes || toIndex < 0 || toIndex >= scenes.length) return;
    const [scene] = scenes.splice(fromIndex, 1);
    scenes.splice(toIndex, 0, scene);
    changed(blueprint);
}
