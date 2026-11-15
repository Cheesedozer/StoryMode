/**
 * Wizard Step Renderers
 * Concept, story, characters and review steps of the standalone generation wizard.
 */

import { escapeHtml } from '../../../lib/blueprint/utils.js';
import { DROPDOWN_OPTIONS } from '../../../lib/blueprint/schema.js';
import { getCharacters, getPersonas } from '../../adapters/character-adapter.js';

const esc = v => escapeHtml(v == null ? '' : String(v));

/**
 * Render the concept step
 * @param {jQuery} $container - Container element
 * @param {Array} storyTypes - Available story types
 * @param {Object} wizardData - Current wizard data
 */
export function renderConceptStep($container, storyTypes, wizardData) {
    const sorted = [...storyTypes].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    $container.append(`
        <h3>What kind of story do you want to create?</h3>
        <div class="form-group">
            <label>Story Type *</label>
            <select class="form-control" name="story_type_id" required>
                <option value="">Select a story type...</option>
                ${sorted.map(st => `<option value="${esc(st.id)}">${esc(st.name)}${st.category?.length ? ` (${esc(st.category.join(', '))})` : ''}</option>`).join('')}
            </select>
        </div>
        <div class="form-group">
            <label>Core Premise *</label>
            <textarea class="form-control" name="core_premise" rows="4"
                placeholder="Who your character is, what starts the story, what they want, and what stands in the way">${esc(wizardData.core_premise)}</textarea>
            <small class="text-muted">The strongest premises say what the protagonist wants, why, and what opposes them.</small>
        </div>
    `);
    $container.find('[name="story_type_id"]').val(wizardData.story_type_id || '');
}

/**
 * Render the story details step
 * @param {jQuery} $container - Container element
 * @param {Array} authorStyles - Available writing styles
 * @param {Object} wizardData - Current wizard data
 */
export function renderStoryStep($container, authorStyles, wizardData) {
    const sorted = [...authorStyles].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    $container.append(`
        <h3>Tell us more about your story</h3>
        <div class="form-group">
            <label>Writing Style</label>
            <select class="form-control" name="author_style">
                <option value="">No specific style</option>
                ${sorted.map(as => `<option value="${esc(as.id)}">${esc(as.name)}</option>`).join('')}
            </select>
        </div>
        <div class="form-row col-2">
            <div class="form-group">
                <label>Number of Scenes</label>
                <input type="number" class="form-control" name="scene_count" min="3" max="30" value="${esc(wizardData.scene_count || 10)}">
            </div>
            <div class="form-group">
                <label>Genre Interpretation</label>
                <select class="form-control" name="metaphor_level">
                    ${DROPDOWN_OPTIONS.metaphorLevel.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
                </select>
                <small class="text-muted">Literal: genre elements are real. Symbolic: they stand for human conflicts.</small>
            </div>
        </div>
        <div class="form-group">
            <label>Genre</label>
            <input type="text" class="form-control" name="genre" value="${esc(wizardData.genre)}">
        </div>
        <div class="form-group">
            <label>Primary Tone</label>
            <input type="text" class="form-control" name="tone" value="${esc(wizardData.tone)}">
        </div>
        <div class="form-group">
            <label>Setting: Location</label>
            <input type="text" class="form-control" name="setting_location" value="${esc(wizardData.setting_location)}">
        </div>
        <div class="form-group">
            <label>Setting: Time Period</label>
            <input type="text" class="form-control" name="setting_time" value="${esc(wizardData.setting_time)}">
        </div>
    `);
    $container.find('[name="author_style"]').val(wizardData.author_style || '');
    $container.find('[name="metaphor_level"]').val(wizardData.metaphor_level || 'mixed');
}

/**
 * Render the characters step. Personas and characters load from the open
 * SillyTavern tab; the persona is always the protagonist.
 * @param {jQuery} $container - Container element
 * @param {Object} wizardData - Current wizard data
 */
export function renderCharactersStep($container, wizardData) {
    $container.append(`
        <h3>Who is in the story?</h3>
        <div class="form-group">
            <label>Your Persona (the protagonist)</label>
            <select class="form-control" name="persona_id">
                <option value="">Loading personas...</option>
            </select>
            <small class="text-muted">You play this character. The blueprint sets up situations for them and leaves their choices to you.</small>
        </div>
        <div class="form-group">
            <label>Characters</label>
            <div class="wizard-character-list" data-role="character-list"><em>Loading characters...</em></div>
            <small class="text-muted">Optional: existing characters to build the story around. Leave empty to have new ones created.</small>
        </div>
        <div class="form-group">
            <label>About your character in this story</label>
            <textarea class="form-control" name="protagonist_description" rows="3">${esc(wizardData.protagonist_description)}</textarea>
            <small class="text-muted">Optional: their situation, goal, or history in this particular story.</small>
        </div>
        <div class="form-group">
            <label>Opposition</label>
            <textarea class="form-control" name="antagonist_description" rows="3">${esc(wizardData.antagonist_description)}</textarea>
            <small class="text-muted">Who or what stands in the way: a person, a faction, nature, society, or something within.</small>
        </div>
        <div class="form-group">
            <label>Additional Notes</label>
            <textarea class="form-control" name="additional_notes" rows="3">${esc(wizardData.additional_notes)}</textarea>
        </div>
    `);

    populateCharacterChoices($container, wizardData);
}

async function populateCharacterChoices($container, wizardData) {
    const [{ current, personas }, characters] = await Promise.all([getPersonas(), getCharacters()]);

    const $persona = $container.find('[name="persona_id"]').empty();
    if (!personas.length) {
        $persona.append('<option value="">No personas found (open SillyTavern in another tab)</option>');
    } else {
        $persona.append('<option value="">None</option>');
        personas.forEach(p => $persona.append($('<option>').val(p.id).text(p.name)));
        $persona.val(wizardData.persona_id ?? current ?? '');
    }

    const selected = new Set(wizardData.character_avatars || []);
    const $list = $container.find('[data-role="character-list"]').empty();
    if (!characters.length) {
        $list.append('<em>No characters found.</em>');
        return;
    }
    [...characters]
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .forEach(c => {
            const $label = $('<label>').addClass('checkbox-label');
            $label.append($('<input type="checkbox" name="character_avatars">').val(c.avatar).prop('checked', selected.has(c.avatar)));
            $label.append(document.createTextNode(` ${c.name}`));
            $list.append($label);
        });
}

/**
 * Render the review step
 * @param {jQuery} $container - Container element
 * @param {Array} storyTypes - Available story types
 * @param {Object} wizardData - Current wizard data
 */
export function renderReviewStep($container, storyTypes, wizardData) {
    const typeName = storyTypes.find(t => t.id === wizardData.story_type_id)?.name || 'Not selected';
    const characterCount = (wizardData.character_avatars || []).length;

    $container.append(`
        <h3>Ready to generate your blueprint</h3>
        <div class="review-section">
            <h4>Story Concept</h4>
            <p><strong>Story Type:</strong> ${esc(typeName)}</p>
            <p><strong>Core Premise:</strong> ${esc(wizardData.core_premise || 'Not specified')}</p>
        </div>
        <div class="review-section">
            <h4>Story Details</h4>
            <p><strong>Scenes:</strong> ${esc(wizardData.scene_count || 10)} · <strong>Interpretation:</strong> ${esc(wizardData.metaphor_level || 'mixed')}</p>
            <p><strong>Genre:</strong> ${esc(wizardData.genre || 'Not specified')} · <strong>Tone:</strong> ${esc(wizardData.tone || 'Not specified')}</p>
            <p><strong>Setting:</strong> ${esc([wizardData.setting_location, wizardData.setting_time].filter(Boolean).join(', ') || 'Not specified')}</p>
        </div>
        <div class="review-section">
            <h4>Characters</h4>
            <p><strong>Protagonist:</strong> ${wizardData.persona_id ? 'your selected persona' : 'no persona selected'}</p>
            <p><strong>Characters:</strong> ${characterCount ? `${characterCount} selected` : 'new characters will be created'}</p>
        </div>
        ${wizardData.selected_lore_entries?.length ? `
            <div class="review-section">
                <h4>World Lore</h4>
                <p><strong>Selected Entries:</strong> ${wizardData.selected_lore_entries.length} entries from ${esc([...new Set(wizardData.selected_lore_entries.map(e => e.world))].join(', '))}</p>
                <p><strong>Storage:</strong> ${wizardData.embed_lorebook ? 'Embedded (portable)' : 'Linked (requires connection)'}</p>
            </div>
        ` : ''}
        <div class="generation-info">
            <i class="fa-solid fa-info-circle"></i>
            <p>Generation runs in your SillyTavern tab using your Story Mode connection settings, in four phases:
            <strong>Foundation → Characters → Scenes → Endings</strong>. It usually takes a few minutes.</p>
        </div>
    `);
}
