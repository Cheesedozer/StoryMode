/**
 * Details Editor Module
 *
 * Edits the blueprint's top-level fields. Every input writes straight back to
 * the current blueprint (by dotted path), so the Details tab, the other tabs,
 * Save and Export all see the same data. Field paths match the real
 * blueprint schema produced by generation (see lib/blueprint/normalization.js).
 */

import { renderCollapsible } from '../form/collapsible.js';
import { DROPDOWN_OPTIONS } from '../../lib/blueprint/schema.js';
import { getStoryTypes, getAuthorStyles } from '../adapters/connection-bridge.js';

// ============================================================================
// FIELD DEFINITIONS
// ============================================================================

/**
 * Field kinds:
 *   text     single-line input
 *   area     multi-line textarea (rows)
 *   lines    textarea, one array item per line
 *   select   dropdown (options, or optionsFrom: 'storyTypes' | 'authorStyles')
 */
const SECTIONS = [
    {
        id: 'core', title: 'Core Identity', icon: 'fa-fingerprint', expanded: true,
        fields: [
            { path: 'blueprint_title', label: 'Title', kind: 'text' },
            { path: 'story_type_id', label: 'Story Type', kind: 'select', optionsFrom: 'storyTypes' },
            { path: 'author_style', label: 'Writing Style', kind: 'select', optionsFrom: 'authorStyles', allowEmpty: 'None' },
            { path: 'core_premise', label: 'Core Premise', kind: 'area', rows: 4, help: 'Protagonist, catalyst, goal, motivation, and what stands in the way.' },
            { path: 'user_scenario', label: 'Original Scenario Notes', kind: 'area', rows: 3 },
        ],
    },
    {
        id: 'setting', title: 'Setting', icon: 'fa-map',
        fields: [
            { path: 'setting.location', label: 'Location', kind: 'text' },
            { path: 'setting.time_period', label: 'Time Period', kind: 'text' },
            { path: 'setting.atmosphere', label: 'Atmosphere', kind: 'area', rows: 2 },
        ],
    },
    {
        id: 'protagonists', title: 'Protagonists', icon: 'fa-users',
        fields: [
            { path: 'protagonist_group.description', label: 'Description', kind: 'area', rows: 3 },
            { path: 'protagonist_group.shared_goal', label: 'Shared Goal', kind: 'area', rows: 2 },
            { path: 'protagonist_group.group_dynamic', label: 'Group Dynamic', kind: 'area', rows: 2 },
        ],
    },
    {
        id: 'opposition', title: 'Opposition', icon: 'fa-skull',
        fields: [
            { path: 'antagonistic_forces.description', label: 'Description', kind: 'area', rows: 3 },
            { path: 'antagonistic_forces.nature', label: 'Nature', kind: 'select', options: DROPDOWN_OPTIONS.antagonistNature },
            { path: 'antagonistic_forces.motivation', label: 'Motivation', kind: 'area', rows: 2 },
            { path: 'antagonistic_forces.manifestations', label: 'Manifestations (one per line)', kind: 'lines', rows: 4 },
        ],
    },
    {
        id: 'arc', title: 'Arc Structure', icon: 'fa-sitemap',
        fields: [
            { path: 'arc_structure.opening_hook', label: 'Opening Hook', kind: 'area', rows: 2 },
            { path: 'arc_structure.escalation_pattern', label: 'Escalation Pattern', kind: 'area', rows: 2 },
            { path: 'arc_structure.climax_nature', label: 'Climax', kind: 'area', rows: 2 },
            { path: 'arc_structure.resolution_style', label: 'Resolution Style', kind: 'area', rows: 2 },
        ],
    },
    {
        id: 'tone', title: 'Tone & Style', icon: 'fa-palette',
        fields: [
            { path: 'tone_and_style.primary_tone', label: 'Primary Tone', kind: 'text' },
            { path: 'tone_and_style.narrative_voice', label: 'Narrative Voice', kind: 'text' },
            { path: 'tone_and_style.pacing', label: 'Pacing', kind: 'text' },
            { path: 'tone_and_style.key_stylistic_elements', label: 'Stylistic Elements (one per line)', kind: 'lines', rows: 4 },
        ],
    },
    {
        id: 'content', title: 'Content & Interpretation', icon: 'fa-shield-halved',
        fields: [
            { path: 'content_boundaries.violence_level', label: 'Intended Violence', help: 'What this story aims for. Your Mature Content setting in SillyTavern decides how far it can go.', kind: 'select', options: DROPDOWN_OPTIONS.violenceLevel, allowEmpty: 'Not specified' },
            { path: 'content_boundaries.romance_level', label: 'Intended Romance', kind: 'select', options: DROPDOWN_OPTIONS.romanceLevel, allowEmpty: 'Not specified' },
            { path: 'genre_realism_notes.metaphor_level_used', label: 'Metaphor Level', kind: 'select', options: DROPDOWN_OPTIONS.metaphorLevel, allowEmpty: 'Not specified' },
            { path: 'genre_realism_notes.implementation_notes', label: 'Interpretation Notes', kind: 'area', rows: 2 },
        ],
    },
    {
        id: 'opening', title: 'Opening Message', icon: 'fa-scroll',
        fields: [
            { path: 'opening_message', label: 'First message the player sees', kind: 'area', rows: 10 },
        ],
    },
    {
        id: 'endings', title: 'Endings', icon: 'fa-flag-checkered',
        fields: [
            { path: 'primary_ending.title', label: 'Primary Ending: Title', kind: 'text' },
            { path: 'primary_ending.description', label: 'Primary Ending: Description', kind: 'area', rows: 4 },
            { path: 'primary_ending.thematic_resolution', label: 'Primary Ending: Thematic Resolution', kind: 'area', rows: 2 },
            { path: 'alternate_endings.0.title', label: 'Alternate Ending 1: Title', kind: 'text' },
            { path: 'alternate_endings.0.description', label: 'Alternate Ending 1: Description', kind: 'area', rows: 3 },
            { path: 'alternate_endings.1.title', label: 'Alternate Ending 2: Title', kind: 'text' },
            { path: 'alternate_endings.1.description', label: 'Alternate Ending 2: Description', kind: 'area', rows: 3 },
        ],
    },
];

// ============================================================================
// PATH HELPERS
// ============================================================================

function getPath(obj, path) {
    return path.split('.').reduce((cur, key) => (cur == null ? undefined : cur[key]), obj);
}

function setPath(obj, path, value) {
    const keys = path.split('.');
    let cur = obj;
    keys.slice(0, -1).forEach((key, i) => {
        if (cur[key] == null || typeof cur[key] !== 'object') {
            cur[key] = /^\d+$/.test(keys[i + 1]) ? [] : {};
        }
        cur = cur[key];
    });
    cur[keys[keys.length - 1]] = value;
}

// ============================================================================
// RENDERING
// ============================================================================

function renderField(blueprint, field, readonly) {
    const id = `details-${field.path.replace(/\./g, '-')}`;
    const value = getPath(blueprint, field.path);
    const $group = $('<div>').addClass('form-group');
    $group.append($('<label>').attr('for', id).text(field.label));

    let $input;
    if (field.kind === 'select') {
        $input = $('<select>').addClass('form-control');
        if (field.allowEmpty) $input.append($('<option>').val('').text(field.allowEmpty));
        (field.options || []).forEach(o => $input.append($('<option>').val(o.value).text(o.label)));
        if (field.optionsFrom) $input.attr('data-options-from', field.optionsFrom);
        $input.data('pending-value', value ?? '');
        $input.val(value ?? '');
    } else if (field.kind === 'text') {
        $input = $('<input type="text">').addClass('form-control').val(value ?? '');
    } else {
        const text = field.kind === 'lines' ? (Array.isArray(value) ? value.join('\n') : (value ?? '')) : (value ?? '');
        $input = $('<textarea>').addClass('form-control').attr('rows', field.rows || 3).val(text);
    }

    $input.attr({ id, 'data-field-path': field.path, 'data-kind': field.kind }).prop('disabled', readonly);
    $group.append($input);
    if (field.help) $group.append($('<small>').addClass('text-muted').text(field.help));
    return $group;
}

/** Fill story type / writing style dropdowns once the lists load. */
async function populateStyleSelects($content) {
    const [storyTypes, authorStyles] = await Promise.all([
        getStoryTypes().catch(() => []),
        getAuthorStyles().catch(() => []),
    ]);
    const lists = { storyTypes, authorStyles };

    $content.find('select[data-options-from]').each(function () {
        const $select = $(this);
        const list = lists[$select.attr('data-options-from')] || [];
        const current = $select.data('pending-value');
        [...list]
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
            .forEach(item => $select.append($('<option>').val(item.id).text(item.name)));
        // Keep an id that isn't in the list (e.g. a style missing on this install)
        if (current && !list.some(item => item.id === current)) {
            $select.append($('<option>').val(current).text(`${current} (not installed)`));
        }
        $select.val(current || '');
    });

    $content.data('style-lists', lists);
}

/**
 * Render the Details tab content
 * @param {Object} blueprint - Blueprint object
 * @param {Object} options - { readonly }
 * @returns {jQuery} Details tab content
 */
export function renderDetailsTab(blueprint, options = {}) {
    const { readonly = false } = options;
    const $content = $('<div>').addClass('details-editor');

    for (const section of SECTIONS) {
        const $section = renderCollapsible({
            id: `details-${section.id}`,
            title: section.title,
            icon: `fa-solid ${section.icon}`,
            expanded: !!section.expanded,
        });
        const $body = $section.find('.collapsible-content');
        section.fields.forEach(field => $body.append(renderField(blueprint, field, readonly)));
        $content.append($section);
    }

    populateStyleSelects($content);
    bindWriteThrough($content, blueprint);
    return $content;
}

// ============================================================================
// WRITE-THROUGH
// ============================================================================

function readInput($input) {
    const raw = $input.val() ?? '';
    if ($input.attr('data-kind') === 'lines') {
        return raw.split('\n').map(s => s.trim()).filter(Boolean);
    }
    return raw;
}

function bindWriteThrough($content, blueprint) {
    $content.on('input.details-editor change.details-editor', '[data-field-path]', function () {
        const $input = $(this);
        const path = $input.attr('data-field-path');
        const value = readInput($input);
        setPath(blueprint, path, value);

        // Keep denormalized names in step with the selected ids
        const lists = $content.data('style-lists') || {};
        if (path === 'story_type_id') {
            blueprint.story_type_name = lists.storyTypes?.find(t => t.id === value)?.name || blueprint.story_type_name;
        } else if (path === 'author_style') {
            blueprint.author_style_name = lists.authorStyles?.find(s => s.id === value)?.name || '';
        } else if (path === 'blueprint_title') {
            blueprint.userMetadata = { ...(blueprint.userMetadata || {}), title: value };
        }

        $(document).trigger('blueprint:edited', { blueprint, path });
    });
}
