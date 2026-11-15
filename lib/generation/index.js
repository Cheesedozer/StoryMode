/**
 * @file Generation module public API
 * @module generation
 */

// Re-export from templates.js
export {
    SummaryStyle,
    MetaphorLevel,
    loadTemplate,
    renderTemplate,
    extractBlock,
    getSceneSummaryTemplate,
    getSummaryRequirements,
    getOpeningMessageTemplate,
    getMetaphorInstructions,
    buildSceneSummaryPrompt,
    buildOpeningMessagePrompt,
    getFoundationPromptTemplate,
    buildFoundationPrompt,
    getCharactersPromptWithDataTemplate,
    getCharactersPromptGenerateTemplate,
    buildCharactersPromptWithData,
    buildCharactersPromptGenerate,
    getScenesPromptTemplate,
    buildScenesPrompt,
    getResolutionsPromptTemplate,
    buildResolutionsPrompt,
    getValidationPromptTemplate,
} from './templates.js';

// Re-export from prompts.js
export { buildBlueprintRequest, buildPhasePrompt, getExpectedSceneCount } from './prompts.js';

// Re-export from orchestration.js
export {
    initOrchestration,
    generateBlueprint,
    generateBlueprintPhased,
    generateWithPreset,
    generateOpeningMessage,
} from './orchestration.js';

// Re-export from style-generator.js
export {
    generateAuthorStyle,
    generateStoryType,
} from './style-generator.js';
