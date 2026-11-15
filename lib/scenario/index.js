/**
 * @file Scenario module public API
 * @module scenario
 */

export {
    markBeatCompleted,
    markBeatSkipped,
    getCompletedBeats,
    resetBeatProgress,
} from './beats.js';

export {
    buildScenarioModeInjection,
    escapeXmlAttr,
    deriveExitTrigger,
    buildSignalsBlock,
} from './injection.js';

export { buildMissingCharactersXml, getMissingCharactersForInjection, getMissingCharactersForScene } from './character-injection.js';
