import { getOriginalStoryType } from '../core/state-manager.js';
import { escapeHtml, ui } from '../ui/component-system.js';
import { createHelpIcon } from '../ui/components.js';
import { callGenericPopup, Popup, POPUP_TYPE, POPUP_RESULT } from '/scripts/popup.js';
import { getSillyTavernGlobals } from './type-editor-utils.js';
import { PHASES, PHASE_LABELS, PHASE_DISTRIBUTION, PHASE_DESCRIPTIONS, getPhasePrompts, normalizePhase } from '../core/phases.js';

/**
 * Build the inner form fields for the memorable element editor
 * @param {Object} me - Memorable element data (may be empty object)
 * @param {boolean} hasElement - Whether a memorable element currently exists
 * @returns {string} HTML string for the fields
 */
function buildMemorableElementFields(me, hasElement) {
    const types = ['revelation', 'climax', 'twist', 'emotional_peak', 'moral_choice'];
    const placements = PHASES;
    const currentPlacement = normalizePhase(me.placement, 'climax');
    const typeOpts = types.map(t =>
        `<option value="${t}" ${me.type === t ? 'selected' : ''}>${t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>`
    ).join('');
    const placeOpts = placements.map(p =>
        `<option value="${p}" ${currentPlacement === p ? 'selected' : ''}>${PHASE_LABELS[p]} Phase</option>`
    ).join('');
    const hooksText = escapeHtml((me.setup_hooks || []).join('\n'));

    return buildMemorableElementHtml(typeOpts, placeOpts, me, hooksText, hasElement);
}

function buildMemorableElementHtml(typeOpts, placeOpts, me, hooksText, hasElement) {
    return `
<div class="storymode-memorable-info">
    <i class="fa-solid fa-lightbulb"></i>
    <div>
        <strong>What is a Memorable Element?</strong>
        <p>The signature moment of this story type, written as a situation that happens to the
        protagonist no matter what. The player can steer it but not prevent it, like a car coming
        head-on: it arrives either way, and how they swerve is up to them. Describe what happens and
        how they might respond, not the outcome. Setup hooks are planted earlier so it feels earned.</p>
    </div>
</div>
<div class="storymode-memorable-toggle">
    <label class="checkbox_label">
        <input type="checkbox" id="edit_memorable_enabled" ${hasElement ? 'checked' : ''}>
        <span>Include a memorable element for this story type</span>
    </label>
</div>
<div id="memorable_element_fields" class="storymode-memorable-fields"
     style="display: ${hasElement ? 'flex' : 'none'};">
    <div class="storymode-form-row">
        <div class="storymode-field">
            <label>Moment Type ${createHelpIcon('Revelation, climax, twist, or emotional peak')}</label>
            <select id="edit_memorable_type" class="text_pole">${typeOpts}</select>
        </div>
        <div class="storymode-field">
            <label>Placement ${createHelpIcon('Which arc phase this moment occurs in')}</label>
            <select id="edit_memorable_placement" class="text_pole">${placeOpts}</select>
        </div>
    </div>
    <div class="storymode-field">
        <label>Name ${createHelpIcon('An evocative name for this defining moment')}</label>
        <input type="text" id="edit_memorable_name" class="text_pole"
               placeholder="e.g., The Truth Behind the Velvet Curtain"
               value="${escapeHtml(me.name || '')}" />
    </div>
    <div class="storymode-field">
        <label>Description ${createHelpIcon('What happens during this moment')}</label>
        <textarea id="edit_memorable_description" class="text_pole" rows="3"
                  placeholder="Describe what happens in this memorable moment...">${escapeHtml(me.description || '')}</textarea>
    </div>
    <div class="storymode-field">
        <label>Setup Hooks ${createHelpIcon('Foreshadowing hints planted earlier in the story, one per line')}</label>
        <textarea id="edit_memorable_hooks" class="text_pole" rows="4"
                  placeholder="Early hints that something is amiss&#10;A seemingly minor detail that gains significance later&#10;A character's behavior that doesn't quite fit">${hooksText}</textarea>
        <small class="notes">One foreshadowing hook per line. These hints are woven into earlier scenes to build anticipation.</small>
    </div>
</div>`;
}

/**
 * Extract memorable element data from the edit form
 * @param {jQuery} content - Form content jQuery element
 * @returns {Object|undefined} Memorable element, or undefined if disabled
 */
function extractMemorableElement(content) {
    if (!content.find('#edit_memorable_enabled').is(':checked')) return undefined;

    const hooksText = content.find('#edit_memorable_hooks').val().trim();
    return {
        type: content.find('#edit_memorable_type').val() || 'revelation',
        name: content.find('#edit_memorable_name').val().trim(),
        description: content.find('#edit_memorable_description').val().trim(),
        placement: content.find('#edit_memorable_placement').val() || 'climax',
        setup_hooks: hooksText ? hooksText.split('\n').map(h => h.trim()).filter(Boolean) : [],
    };
}

/**
 * Show the story type edit form modal.
 * Displays form fields for editing or creating a story type.
 * Includes revert button if editing a non-original type.
 *
 * @async
 * @param {Object} type - The story type object to edit or use as template.
 * @param {boolean} isNew - True if creating a new type, false if editing existing.
 * @returns {Promise<Object|null>} Object with storyType property if saved, null if cancelled.
 */
async function showStoryTypeEditForm(type, isNew) {
    const { toastr } = getSillyTavernGlobals();
    const hasOriginal = !isNew && getOriginalStoryType(type.id);

    const content = buildStoryTypeFormContent(type, hasOriginal);

    bindStoryTypeFormEvents(content, type, toastr);

    const popup = new Popup(content, POPUP_TYPE.CONFIRM, '', {
        okButton: isNew ? 'Add' : 'Save',
        cancelButton: 'Cancel',
        wide: true,
        large: true,
        allowVerticalScrolling: true,
    });

    const result = await popup.show();

    if (result) {
        return extractStoryTypeFormData(content, type, toastr);
    }

    return null;
}

function buildStoryTypeFormContent(type, hasOriginal) {
    const revertButtonHtml = hasOriginal ? `<button id="revert_to_default_btn" class="storymode-revert-btn storymode-revert-btn--top" title="Reset this story type to its original predefined version">
<i class="fa-solid fa-rotate-left"></i> Revert to Original
</button>` : '';

    const basicInfoContent = `
<div class="storymode-form-row">
    <div class="storymode-field">
        <label>Name ${createHelpIcon('Display name for this story type')}</label>
        <input type="text" id="edit_type_name" class="text_pole" value="${escapeHtml(type.name || '')}" />
    </div>
    <div class="storymode-field">
        <label>Category ${createHelpIcon('Comma-separated genres for filtering')}</label>
        <input type="text" id="edit_type_category" class="text_pole" placeholder="e.g., Mystery, Horror" value="${escapeHtml(type.category ? type.category.join(', ') : '')}" />
    </div>
</div>
`;

    const storyBlueprintContent = `
<div class="storymode-field">
    <label>Story Prompt ${createHelpIcon('Complete narrative guidance for the AI')}</label>
    <textarea id="edit_type_story_prompt" class="text_pole" rows="12">${escapeHtml(type.storyPrompt || '')}</textarea>
    <small class="notes">The complete story blueprint and guidance for the LLM. Edit freely to customize the storytelling approach.</small>
</div>
`;

    const arcPhasesContent = buildArcPhasesContent(type);

    const me = type.memorableElement || {};
    const hasMemorableElement = !!type.memorableElement;
    const memorableContent = buildMemorableElementFields(me, hasMemorableElement);

    const html = `
<div class="storymode-edit-form">
    ${revertButtonHtml}
    ${ui.card({ id: 'edit_basic_info', title: 'Basic Information', icon: 'fa-solid fa-info-circle', content: basicInfoContent })}
    ${ui.card({ id: 'edit_story_blueprint', title: 'Story Prompt', icon: 'fa-solid fa-scroll', content: storyBlueprintContent })}
    ${ui.card({ id: 'edit_arc_phases', title: 'Arc Phases', icon: 'fa-solid fa-chart-line', content: arcPhasesContent })}
    ${ui.card({ id: 'edit_memorable_element', title: 'Memorable Element', icon: 'fa-solid fa-star', content: memorableContent })}
</div>
`;

    return $(html);
}

function buildArcPhasesContent(type) {
    const prompts = getPhasePrompts(type);
    const phaseFields = PHASES.map(phase => `
<div class="storymode-field">
    <label>${PHASE_LABELS[phase]} Phase (~${Math.round(PHASE_DISTRIBUTION[phase] * 100)}%) ${createHelpIcon(PHASE_DESCRIPTIONS[phase])}</label>
    <textarea id="edit_type_${phase}" class="text_pole" rows="2">${escapeHtml(prompts[phase])}</textarea>
</div>`).join('');
    return `
<div class="storymode-field">
    <label>Progress Template ${createHelpIcon('Variables: {currentStep}, {arcLength}, {arcPercent}, {phase}')}</label>
    <textarea id="edit_type_template" class="text_pole" rows="2">${escapeHtml(type.progressTemplate || '')}</textarea>
</div>
${phaseFields}
`;
}

function bindStoryTypeFormEvents(content, type, toastr) {
    // Set up revert to original button if it exists
    content.find('#revert_to_default_btn').on('click', async function () {
        const originalType = getOriginalStoryType(type.id);
        if (originalType) {
            const result = await callGenericPopup(
                `Revert "${type.name}" to its original story prompt? Your current changes will be lost.`,
                POPUP_TYPE.CONFIRM,
                '',
                { okButton: 'Revert', cancelButton: 'Cancel' }
            );
            if (result === POPUP_RESULT.AFFIRMATIVE) {
                // Update the textarea with original content
                content.find('#edit_type_story_prompt').val(originalType.storyPrompt || '');
                toastr.info('Story prompt reverted to original. Click Save to apply changes.');
            }
        }
    });

    // Memorable element fields visibility toggle
    content.find('#edit_memorable_enabled').on('change', function () {
        content.find('#memorable_element_fields').css('display', this.checked ? 'flex' : 'none');
    });
}

function extractStoryTypeFormData(content, type, toastr) {
    const name = content.find('#edit_type_name').val().trim();
    const categoryText = content.find('#edit_type_category').val().trim();
    const storyPrompt = content.find('#edit_type_story_prompt').val().trim();
    const template = content.find('#edit_type_template').val().trim();
    const phasePrompts = Object.fromEntries(
        PHASES.map(phase => [phase, (content.find(`#edit_type_${phase}`).val() || '').trim()]),
    );

    if (!name) {
        toastr.error('Name is required');
        return null;
    }

    const categories = categoryText.split(',').map(c => c.trim()).filter(c => c);

    const memorableElement = extractMemorableElement(content);

    const editedType = {
        ...type,
        name,
        category: categories,
        storyPrompt,
        progressTemplate: template,
        phasePrompts,
    };

    // Include or remove memorable element based on toggle
    if (memorableElement) {
        editedType.memorableElement = memorableElement;
    } else {
        delete editedType.memorableElement;
    }

    return {
        storyType: editedType
    };
}

export {
    buildMemorableElementFields,
    extractMemorableElement,
    showStoryTypeEditForm,
};
