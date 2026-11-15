
/**
 * Get the current scene based on blueprint state and round progress.
 * Returns the scene object with its index.
 *
 * @param {Object} blueprint - The blueprint object
 * @param {number} currentStep - Current round/step in the story
 * @param {number} arcLength - Total arc length (rounds)
 * @param {string} sceneMode - 'auto' or 'manual'
 * @param {number} manualSceneIndex - Manual scene index (for manual mode)
 * @returns {Object|null} Current scene object with index, or null if no blueprint
 */
export function getCurrentScene(blueprint, currentStep, arcLength, sceneMode = 'auto', manualSceneIndex = 0) {
    if (!blueprint || !blueprint.scene_plan || blueprint.scene_plan.length === 0) {
        return null;
    }

    let sceneIndex;

    if (sceneMode === 'manual') {
        // Manual mode: use the stored scene index
        sceneIndex = Math.max(0, Math.min(manualSceneIndex, blueprint.scene_plan.length - 1));
    } else {
        // Auto mode: calculate scene based on round progress
        // Distribute scenes evenly across the arc length
        const progress = currentStep / arcLength;
        sceneIndex = Math.floor(progress * blueprint.scene_plan.length);
        // Clamp to valid range
        sceneIndex = Math.max(0, Math.min(sceneIndex, blueprint.scene_plan.length - 1));
    }

    return {
        index: sceneIndex,
        ...blueprint.scene_plan[sceneIndex],
    };
}

/**
 * Advance the scene index manually (for manual mode).
 * Clamps result to valid range [0, maxScenes - 1].
 *
 * @param {number} currentIndex - Current scene index
 * @param {number} direction - 1 for forward, -1 for backward
 * @param {number} maxScenes - Total number of scenes
 * @returns {number} New scene index
 */
export function advanceSceneIndex(currentIndex, direction, maxScenes) {
    const newIndex = currentIndex + direction;
    // Clamp to valid range [0, maxScenes - 1]
    return Math.max(0, Math.min(newIndex, maxScenes - 1));
}
