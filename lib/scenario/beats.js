/**
 * @file Beat tracking for Scenario Mode
 * @module scenario/beats
 *
 * Beat statuses live in chatState.scenario.beatState (see createPlayState in
 * core/state-manager.js), which is the only copy. These helpers keep the
 * signature callers already use (scene index first) for compatibility.
 */

import {
    markBeatComplete,
    markBeatSkipped as markBeatSkippedState,
    resetBeatState,
    getCompletedBeatIndices,
} from '../core/state-manager.js';

/**
 * Mark a beat of the current scene as completed
 * @param {number} sceneIndex - Scene index (unused; beats belong to the current scene)
 * @param {number} beatIndex - Beat index within the scene
 * @returns {Promise<boolean>}
 */
export async function markBeatCompleted(sceneIndex, beatIndex) {
    markBeatComplete(beatIndex);
    return true;
}

/**
 * Mark a beat of the current scene as skipped
 * @param {number} sceneIndex - Scene index (unused)
 * @param {number} beatIndex - Beat index within the scene
 * @returns {Promise<boolean>}
 */
export async function markBeatSkipped(sceneIndex, beatIndex) {
    markBeatSkippedState(beatIndex);
    return true;
}

/**
 * Completed beat indices of the current scene
 * @param {number} sceneIndex - Scene index (unused)
 * @returns {Array<number>}
 */
export function getCompletedBeats(sceneIndex) {
    return getCompletedBeatIndices();
}

/**
 * Reset beat statuses (on scene change)
 * @param {number|null} sceneIndex - Scene index (unused)
 */
export async function resetBeatProgress(sceneIndex = null) {
    resetBeatState();
}
