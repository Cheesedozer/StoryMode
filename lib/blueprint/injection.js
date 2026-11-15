/**
 * Blueprint Injection Module
 *
 * Builds the prompt injection for blueprint-driven stories in Scenario Mode
 * (signal-based pacing). Story Mode never injects the blueprint, so this
 * module only handles the Scenario Mode path.
 */

import { extension_settings } from '/scripts/extensions.js';

import { MODULE_NAME } from '../core/index.js';
import { getPacingMode, getCurrentSceneIndex } from '../core/state-manager.js';
import { buildScenarioModeInjection, escapeXmlAttr } from '../scenario/index.js';

/**
 * Build the Scenario Mode injection: previous-scene summaries (if enabled)
 * followed by the current abstract act, beats and signal instructions.
 *
 * @param {Object} blueprintState - The current blueprint state.
 * @returns {string|null} The injection text, or null if not applicable.
 */
export function buildBlueprintInjection(blueprintState) {
    if (!blueprintState?.useBlueprint || !blueprintState.blueprint) {
        return null;
    }
    if (getPacingMode() !== 'scenario') {
        return null;
    }

    const settings = extension_settings[MODULE_NAME];
    const scenarioInjection = buildScenarioModeInjection(blueprintState);
    if (!scenarioInjection) return null;

    let summariesXml = '';
    if (settings.blueprintSettings?.includeSummariesInPrompt && blueprintState.sceneSummaries) {
        const sceneIndex = getCurrentSceneIndex();
        const summaryEntries = Object.entries(blueprintState.sceneSummaries)
            .filter(([idx]) => parseInt(idx) < sceneIndex)
            .sort(([a], [b]) => parseInt(a) - parseInt(b))
            .map(([idx, { sceneTitle, summary }]) =>
                `  <scene index="${parseInt(idx) + 1}" title="${escapeXmlAttr(sceneTitle || '')}">${summary}</scene>`,
            );

        if (summaryEntries.length > 0) {
            summariesXml = `<previous_scenes>\n${summaryEntries.join('\n')}\n</previous_scenes>\n\n`;
        }
    }

    return summariesXml + scenarioInjection;
}
