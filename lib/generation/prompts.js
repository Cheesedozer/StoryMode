/**
 * @file Prompt builders for blueprint generation
 * @module generation/prompts
 *
 * Builds prompts for master generation and phased generation.
 * Handles author style, persona, character data, and metaphor instructions.
 */

import * as PromptTemplates from './templates.js';
import { power_user } from '/scripts/power-user.js';
import { METAPHOR_LEVELS, MODULE_NAME } from '../core/index.js';
import { extension_settings } from '/scripts/extensions.js';
import { getContentLevel, buildContentGuidance } from '../core/content-level.js';
import { resolveRequestArcs, getBlueprintArcs, describeArcsForGeneration, describeSpineClimax } from '../story/arcs.js';


/**
 * Build the blueprint request object from UI configuration
 * @param {Object} config - Configuration from UI
 * @returns {Object} Blueprint request object
 */
export function buildBlueprintRequest(config) {
    return {
        story_type_id: config.storyTypeId,
        author_style: config.authorStyleId || undefined,
        character_data: config.characterData,
        persona_data: config.personaData || [],
        user_scenario: config.scenario || '',
        total_messages_target: config.messageTarget || 10, // Now represents scene count, not round count
        genre_interpretation: {
            metaphor_level: config.metaphorLevel || METAPHOR_LEVELS.MIXED,
        },
        // Spine shape ('' = story type default) and thread shapes; resolved in resolveRequestArcs
        arcs: Array.isArray(config.arcs) ? config.arcs : [],
    };
}

/**
 * Build metaphor instructions from template
 * @param {string} metaphorLevel - Metaphor level setting
 * @returns {Promise<string>} Metaphor instructions text
 */
async function buildMetaphorInstructions(metaphorLevel) {
    return await PromptTemplates.getMetaphorInstructions(metaphorLevel);
}

// Optional extended author-style fields (custom styles may define them)
const EXTRA_STYLE_FIELDS = [
    ['Narrative techniques', 'narrativeTechniques'],
    ['Dialogue style', 'dialogueStyle'],
    ['Pacing', 'pacingApproach'],
    ['Thematic focus', 'thematicFocus'],
];

/**
 * Build the writing-style section for blueprint generation prompts.
 *
 * The style is passed as a description of technique. The author's name is
 * deliberately left out: "write like <famous author>" tends to produce
 * pastiche of surface tics and borrowed characters, while a description of
 * technique is something the model can apply consistently.
 *
 * Mature-content guidance follows the global content level, voiced by the
 * style's nsfwPrompt, and is included even when no style is selected.
 *
 * @param {Object|null} authorStyle - Author style object
 * @param {string} [focus='the blueprint'] - What the style should shape
 * @returns {string} Formatted section
 */
export function buildAuthorStyleSection(authorStyle, focus = 'the blueprint') {
    const settings = extension_settings?.[MODULE_NAME] || {};
    const contentLevel = getContentLevel(settings);
    const contentGuidance = buildContentGuidance(contentLevel, authorStyle?.nsfwPrompt);
    const contentBlock = contentGuidance
        ? `\n\n**Mature content (${contentLevel}):**\n${contentGuidance}\nDesign romance and intimacy in the blueprint to fit this level.`
        : '';

    if (!authorStyle?.authorPrompt) {
        return `No writing style was selected. Take tone and voice from the story type and the user's scenario.${contentBlock}`;
    }

    const parts = [authorStyle.authorPrompt];
    for (const [label, key] of EXTRA_STYLE_FIELDS) {
        if (authorStyle[key]) parts.push(`**${label}:** ${authorStyle[key]}`);
    }

    return `${parts.join('\n\n')}

Let this style shape ${focus}: how scenes, settings, opposition, character arcs and choices are described, and the tone_and_style fields. The user's scenario, characters, and chosen metaphor level take priority over style.${contentBlock}`;
}

/**
 * Build persona section for prompts
 * @param {Array<Object>} personaData - Array of persona references
 * @returns {string} Formatted persona section or empty string
 */
function buildPersonaSection(personaData) {
    if (!personaData || personaData.length === 0) {
        return '';
    }

    if (typeof power_user === 'undefined' || !power_user.personas || !power_user.persona_descriptions) {
        return '';
    }

    const personaDataStr = personaData.map(personaRef => {
        const personaName = power_user.personas[personaRef.id];
        const personaDesc = power_user.persona_descriptions[personaRef.id];

        if (personaName && personaDesc) {
            let text = `**Persona: ${personaName}`;
            if (personaDesc.title) {
                text += ` (${personaDesc.title})`;
            }
            text += '**\n';
            if (personaDesc.description) {
                text += `Description: ${personaDesc.description}\n`;
            }
            return text;
        }

        return `**Persona: ${personaRef.name}**\nDescription: Persona data not available\n`;
    }).join('\n---\n');

    return `---

### PERSONA DATA

${personaDataStr}

This PERSONA_DATA includes optional user personas that define the player character's identity, personality, and behavior in this story.

**You MUST:**
- Treat personas as defining the player character's role and perspective in the story.
- Incorporate persona traits, goals, and behaviors into the protagonist_group and character_arcs.
- If a persona is provided, it represents who the player is role-playing as in this narrative.

---`;
}

/**
 * Build character data section for prompts
 * @param {Array<Object>} characterData - Array of character objects
 * @returns {string} Formatted character data section
 */
function buildCharacterDataSection(characterData) {
    if (!characterData || characterData.length === 0) {
        return 'No specific character data provided.';
    }

    return characterData.map(char => {
        let text = `**Character: ${char.name}**\n`;
        if (char.description) {
            text += `Description: ${char.description.replace(/\{\{char\}\}/gi, char.name)}\n`;
        }
        if (char.personality) {
            text += `Personality: ${char.personality.replace(/\{\{char\}\}/gi, char.name)}\n`;
        }
        if (char.scenario) {
            text += `Scenario: ${char.scenario.replace(/\{\{char\}\}/gi, char.name)}\n`;
        }
        if (char.greeting) {
            text += `Greeting: ${char.greeting}\n`;
        }
        return text;
    }).join('\n---\n');
}

/**
 * Get expected scene count instruction for blueprint generation
 * @param {number} sceneTarget - Target number of scenes (directly from UI)
 * @returns {string} Scene count instruction for LLM
 */
export function getExpectedSceneCount(sceneTarget) {
    // Now treated as direct scene count rather than rounds
    // Standard presets: 5, 10, 15, 20 scenes
    // For exact matches to presets, use "exactly" wording
    // For custom values, use the exact number requested

    const standardPresets = [5, 10, 15, 20];

    if (standardPresets.includes(sceneTarget)) {
        return `exactly ${sceneTarget} scenes`;
    } else {
        // Custom value - use exact number specified by user
        return `exactly ${sceneTarget} scenes`;
    }
}


/**
 * Build a phase-specific prompt for phased blueprint generation
 * Dispatcher function that routes to the appropriate phase prompt builder
 * @param {number} phase - Phase number (1-4)
 * @param {Object} request - Blueprint request object
 * @param {Object} storyType - Story type object
 * @param {Object} authorStyle - Author style object (optional)
 * @param {Object} partialBlueprint - Partial blueprint from previous phases
 * @returns {Promise<string>} Phase-specific prompt
 */
export async function buildPhasePrompt(phase, request, storyType, authorStyle, partialBlueprint = {}) {
    switch (phase) {
        case 1:
            return buildFoundationPrompt(request, storyType, authorStyle);
        case 2:
            return buildCharactersPrompt(request, storyType, authorStyle, partialBlueprint);
        case 3:
            return buildScenesPrompt(request, storyType, authorStyle, partialBlueprint);
        case 4:
            return buildResolutionsPrompt(request, storyType, authorStyle, partialBlueprint);
        default:
            throw new Error(`Invalid phase: ${phase}`);
    }
}

/**
 * The arcs a generation phase should plan for: Phase 1's merged arcs once
 * they exist, else the request's.
 * @returns {Array<Object>}
 */
export function getGenerationArcs(request, storyType, partialBlueprint = {}) {
    return Array.isArray(partialBlueprint.arcs) && partialBlueprint.arcs.length
        ? getBlueprintArcs(partialBlueprint)
        : resolveRequestArcs(request.arcs, storyType);
}

/**
 * Template variables describing the arcs.
 * @returns {{ARCS_SECTION: string, CLIMAX_NOTE: string}}
 */
export function buildArcVariables(request, storyType, partialBlueprint = {}) {
    const arcs = getGenerationArcs(request, storyType, partialBlueprint);
    return {
        ARCS_SECTION: describeArcsForGeneration(arcs),
        CLIMAX_NOTE: describeSpineClimax(arcs),
    };
}

/**
 * Add lore context to the beginning of a prompt
 * @param {string} prompt - Base prompt
 * @param {string} loreContext - Lore context string
 * @returns {string} Prompt with lore context prepended
 */
function injectLoreContext(prompt, loreContext) {
    if (!loreContext) return prompt;

    return `${loreContext}\n\nBuild the story structure on the world lore above. Respect established rules, characters, and settings. Use the lore to enrich the narrative.\n\n${prompt}`;
}

/**
 * Build Phase 1: Foundation prompt
 */
async function buildFoundationPrompt(request, storyType, authorStyle) {
    const authorStyleSection = buildAuthorStyleSection(authorStyle);
    const personaSection = buildPersonaSection(request.persona_data);
    const characterDataStr = buildCharacterDataSection(request.character_data);
    const metaphorInstructions = await buildMetaphorInstructions(request.genre_interpretation.metaphor_level);
    const expectedSceneCount = getExpectedSceneCount(request.total_messages_target);

    const basePrompt = await PromptTemplates.buildFoundationPrompt({
        storyTypeName: storyType.name,
        storyTypeJson: JSON.stringify(storyType, null, 2),
        authorStyleSection,
        characterData: characterDataStr,
        personaSection,
        userScenario: request.user_scenario || 'No specific scenario provided.',
        metaphorLevel: request.genre_interpretation.metaphor_level,
        metaphorInstructions,
        totalMessagesTarget: request.total_messages_target,
        expectedSceneCount,
        ...buildArcVariables(request, storyType),
    });

    // Inject lore context if present
    return injectLoreContext(basePrompt, request.loreContext);
}

/**
 * Build Phase 2: Characters prompt
 */
async function buildCharactersPrompt(request, storyType, authorStyle, partialBlueprint) {
    const foundation = partialBlueprint.core_premise || '';
    const setting = partialBlueprint.setting || {};
    const antagonist = partialBlueprint.antagonistic_forces || {};
    const arcStructure = partialBlueprint.arc_structure || {};
    const toneAndStyle = partialBlueprint.tone_and_style || {};

    const authorStyleSection = buildAuthorStyleSection(authorStyle, 'the character arcs');
    const personaSection = buildPersonaSection(request.persona_data);
    const characterDataStr = buildCharacterDataSection(request.character_data);
    const metaphorInstructions = await buildMetaphorInstructions(request.genre_interpretation.metaphor_level);
    const expectedSceneCount = getExpectedSceneCount(request.total_messages_target);

    const hasCharacterData = request.character_data && request.character_data.length > 0;

    const builderParams = {
        storyTypeName: storyType.name,
        storyTypeJson: JSON.stringify(storyType, null, 2),
        foundation,
        setting,
        antagonist,
        arcStructure,
        toneAndStyle,
        personaSection,
        authorStyleSection,
        userScenario: request.user_scenario || 'No specific scenario provided.',
        metaphorLevel: request.genre_interpretation.metaphor_level,
        metaphorInstructions,
        totalMessagesTarget: request.total_messages_target,
        expectedSceneCount,
    };

    let basePrompt;
    if (hasCharacterData) {
        basePrompt = await PromptTemplates.buildCharactersPromptWithData({
            ...builderParams,
            characterData: characterDataStr,
        });
    } else {
        basePrompt = await PromptTemplates.buildCharactersPromptGenerate(builderParams);
    }

    // Inject lore context if present
    return injectLoreContext(basePrompt, request.loreContext);
}

/**
 * Build Phase 3: Scenes prompt
 */
async function buildScenesPrompt(request, storyType, authorStyle, partialBlueprint) {
    const foundation = partialBlueprint.core_premise || '';
    const setting = partialBlueprint.setting || {};
    const antagonist = partialBlueprint.antagonistic_forces || {};
    const arcStructure = partialBlueprint.arc_structure || {};
    const toneAndStyle = partialBlueprint.tone_and_style || {};
    const protagonistGroup = partialBlueprint.protagonist_group || {};
    const characters = partialBlueprint.character_arcs || [];
    const expectedSceneCount = getExpectedSceneCount(request.total_messages_target);

    const authorStyleSection = buildAuthorStyleSection(authorStyle, 'the scenes');
    const personaSection = buildPersonaSection(request.persona_data);
    const metaphorInstructions = await buildMetaphorInstructions(request.genre_interpretation.metaphor_level);

    const basePrompt = await PromptTemplates.buildScenesPrompt({
        storyTypeName: storyType.name,
        storyTypeJson: JSON.stringify(storyType, null, 2),
        foundation,
        setting,
        antagonist,
        arcStructure,
        toneAndStyle,
        protagonistGroup,
        characters,
        personaSection,
        authorStyleSection,
        userScenario: request.user_scenario || 'No specific scenario provided.',
        metaphorLevel: request.genre_interpretation.metaphor_level,
        metaphorInstructions,
        totalMessagesTarget: request.total_messages_target,
        expectedSceneCount,
        memorableElement: storyType.memorableElement,
        ...buildArcVariables(request, storyType, partialBlueprint),
    });

    // Inject lore context if present
    return injectLoreContext(basePrompt, request.loreContext);
}

/**
 * Build Phase 4: Resolutions prompt
 */
async function buildResolutionsPrompt(request, storyType, authorStyle, partialBlueprint) {
    const foundation = partialBlueprint.core_premise || '';
    const setting = partialBlueprint.setting || {};
    const antagonist = partialBlueprint.antagonistic_forces || {};
    const arcStructure = partialBlueprint.arc_structure || {};
    const toneAndStyle = partialBlueprint.tone_and_style || {};
    const protagonistGroup = partialBlueprint.protagonist_group || {};
    const characters = partialBlueprint.character_arcs || [];
    const scenes = partialBlueprint.scene_plan || [];

    // For large scene plans (>10 scenes), send only outlines to reduce token usage
    const scenesForPrompt = scenes.length > 10
        ? scenes.map(scene => ({
            index: scene.index,
            title: scene.title,
            phase: scene.phase,
            purpose: scene.purpose,
            situation: scene.situation,
            character_focus: scene.character_focus,
            hooks_for_future: scene.hooks_for_future
        }))
        : scenes;

    const authorStyleSection = buildAuthorStyleSection(authorStyle, 'the endings');
    const personaSection = buildPersonaSection(request.persona_data);
    const metaphorInstructions = await buildMetaphorInstructions(request.genre_interpretation.metaphor_level);

    const basePrompt = await PromptTemplates.buildResolutionsPrompt({
        storyTypeName: storyType.name,
        storyTypeJson: JSON.stringify(storyType, null, 2),
        foundation,
        setting,
        antagonist,
        arcStructure,
        toneAndStyle,
        protagonistGroup,
        characters,
        personaSection,
        authorStyleSection,
        userScenario: request.user_scenario || 'No specific scenario provided.',
        metaphorLevel: request.genre_interpretation.metaphor_level,
        metaphorInstructions,
        sceneCount: scenes.length,
        scenes: scenesForPrompt,
    });

    // Inject lore context if present
    return injectLoreContext(basePrompt, request.loreContext);
}
