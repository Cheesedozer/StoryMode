/**
 * Story Tracker
 *
 * Decides, after each AI reply, which beats completed, whether the scene's
 * goal is settled, and what the ledger should record. Two modes:
 *
 *  - inline: the narrating model appends markers (@@BEAT:N@@, @@NEXT_SCENE@@,
 *    @@NOTE: ...@@) that are parsed and stripped (core/event-handlers.js).
 *  - secondary: a separate, usually cheaper Connection Manager profile reads
 *    the reply and returns JSON. It runs after every reply in the background;
 *    the next generation waits for it (bounded by a timeout) so the prompt
 *    always reflects it. If a call fails, the next reply falls back to
 *    inline markers, and the secondary tracker is tried again after that.
 *
 * @module story/tracker
 */

import { chat } from '/script.js';
import { extension_settings } from '/scripts/extensions.js';
import {
    MODULE_NAME,
    getChatStoryState,
    saveChatStoryState,
    getCurrentSceneIndex,
    getBeatState,
    getPacingMode,
} from '../core/state-manager.js';
import { getBlueprintState } from '../blueprint/storage.js';
import { sendRequestWithReasoningRetry } from '../generation/orchestration.js';
import { robustParseJSON } from '../blueprint/utils.js';
import { getActiveLedgerEntries, addLedgerEntries, LEDGER_TYPES } from './ledger.js';
import { getProgressFingerprint, recordReplyProgress } from './drama.js';
import { getTagHints } from './conditions.js';

export const TRACKER_MODES = { INLINE: 'inline', SECONDARY: 'secondary' };

const MAX_LEDGER_CONTEXT = 40;
const MAX_REPLY_CHARS = 12000;

let pending = Promise.resolve();
let pendingCount = 0;
let warnedNoProfile = false;

/** @returns {{mode: string, profileId: string, timeoutSeconds: number}} */
export function getTrackerSettings() {
    const t = extension_settings[MODULE_NAME]?.tracker || {};
    return {
        mode: t.mode === TRACKER_MODES.SECONDARY ? TRACKER_MODES.SECONDARY : TRACKER_MODES.INLINE,
        profileId: t.profileId || '',
        timeoutSeconds: Number(t.timeoutSeconds) > 0 ? Number(t.timeoutSeconds) : 20,
    };
}

/** @returns {boolean} True when the secondary model is selected and has a profile */
export function isSecondaryTrackerActive() {
    const { mode, profileId } = getTrackerSettings();
    if (mode !== TRACKER_MODES.SECONDARY) return false;
    if (!profileId) {
        if (!warnedNoProfile) {
            warnedNoProfile = true;
            console.warn('[Story Mode] Secondary tracker selected without a profile; using inline markers.');
        }
        return false;
    }
    return true;
}

/**
 * Whether the narrator should be asked for inline markers on the next reply.
 * @returns {boolean}
 */
export function shouldUseInlineMarkers() {
    if (!isSecondaryTrackerActive()) return true;
    return !!getChatStoryState().scenario?.trackerFallback;
}

async function setFallback(value) {
    const state = getChatStoryState();
    if (!!state.scenario.trackerFallback === value) return;
    state.scenario.trackerFallback = value;
    await saveChatStoryState(state);
}

/**
 * Called after an inline-marker reply that was produced as a fallback, so
 * the secondary tracker is tried again on the next reply.
 */
export function clearTrackerFallback() {
    return setFallback(false);
}

// ============================================================================
// PROMPT
// ============================================================================

function previousUserMessage(mesId) {
    for (let i = mesId - 1; i >= 0; i--) {
        if (chat[i]?.is_user) return chat[i];
    }
    return null;
}

function speaker(message) {
    return message?.name ? `${message.name}: ` : '';
}

function buildSceneContext() {
    if (getPacingMode() !== 'scenario') return null;
    const { blueprint, useBlueprint } = getBlueprintState();
    if (!useBlueprint || !blueprint?.scene_plan?.length) return null;

    const index = getCurrentSceneIndex();
    const scene = blueprint.scene_plan[index];
    if (!scene) return null;

    const beatState = getBeatState();
    const beats = (scene.beats || []).map((b, i) => {
        const status = beatState[i]?.status || 'pending';
        return `  ${i}. [${status}] ${b.title || `Beat ${i + 1}`}${b.description ? `: ${b.description}` : ''}`;
    });

    return {
        isFinal: index >= blueprint.scene_plan.length - 1,
        text: [
            `Scene ${index + 1} of ${blueprint.scene_plan.length}: ${scene.title || 'Untitled'}`,
            `Scene goal (the scene ends when this is settled): ${scene.purpose || scene.goal || 'not specified'}`,
            scene.situation ? `Situation: ${scene.situation}` : '',
            beats.length ? `Beats:\n${beats.join('\n')}` : 'This scene has no beats.',
        ].filter(Boolean).join('\n'),
    };
}

function buildTrackerMessages(mesId) {
    const reply = chat[mesId];
    const user = previousUserMessage(mesId);
    const scene = buildSceneContext();
    const { blueprint, useBlueprint } = getBlueprintState();
    const tagHints = scene && useBlueprint ? getTagHints(blueprint, getCurrentSceneIndex()) : [];
    const ledger = getActiveLedgerEntries().slice(-MAX_LEDGER_CONTEXT)
        .map(e => `- [${e.type}] ${e.text}`).join('\n') || '(empty)';

    const sceneFields = scene ? `
  "beats_completed": [indices of pending beats that fully played out in THIS reply],
  "beats_skipped": [indices of pending beats this reply made impossible or irrelevant],
  "scene_complete": true or false, whether the scene goal is now settled (achieved, abandoned, or made impossible),${scene.isFinal ? `
  "story_complete": true or false, whether the story has reached its ending,` : ''}` : '';

    const system = `You keep the continuity record for an interactive story. You read the latest exchange and report only what actually happened on the page. You never invent events, and you do not write story text.

Respond with a single JSON object:
{${sceneFields}
  "ledger_add": [0-3 entries worth remembering later]
}

Each ledger entry: { "type": one of ${LEDGER_TYPES.filter(t => t !== 'note').join(' | ')}, "text": one specific past-tense sentence naming who did what, "tags": 1-3 short snake_case labels, "who_knows": names of characters aware of it }.
Record: choices the protagonist made, secrets revealed, promises or debts, relationship shifts, items gained or lost, lasting changes to the world. Skip routine description, mood, and anything already in the record.${tagHints.length ? `

This story checks for these tags. When an entry matches one, include that exact tag: ${tagHints.join(', ')}` : ''}`;

    const userText = `${scene ? `${scene.text}\n\n` : ''}Record so far:
${ledger}

Latest exchange:
${user ? `${speaker(user)}${user.mes}\n\n` : ''}${speaker(reply)}${String(reply?.mes || '').slice(0, MAX_REPLY_CHARS)}`;

    return { messages: [{ role: 'system', content: system }, { role: 'user', content: userText }], scene };
}

// ============================================================================
// RUN
// ============================================================================

const toIndexList = v => (Array.isArray(v) ? v : []).map(n => parseInt(n, 10)).filter(n => Number.isInteger(n) && n >= 0);

/**
 * Turn the tracker's JSON into the same signals inline markers produce.
 * @param {Object} result - Parsed tracker JSON
 * @param {Object|null} scene - Scene context (null outside Scenario Mode)
 * @param {Object} beatState - Current beat statuses
 * @returns {Array<{type: string, value?: string}>}
 */
export function trackerResultToSignals(result, scene, beatState = {}) {
    if (!scene || !result || typeof result !== 'object') return [];
    const pendingBeat = i => !['complete', 'skipped'].includes(beatState[i]?.status);
    const signals = [];
    toIndexList(result.beats_completed).filter(pendingBeat).forEach(i => signals.push({ type: 'BEAT', value: String(i) }));
    toIndexList(result.beats_skipped).filter(pendingBeat).forEach(i => signals.push({ type: 'SKIP', value: String(i) }));
    if (scene.isFinal && result.story_complete === true) {
        signals.push({ type: 'STORY_COMPLETE' });
    } else if (!scene.isFinal && result.scene_complete === true) {
        signals.push({ type: 'NEXT_SCENE' });
    }
    return signals;
}

async function runTracker(mesId, applySignals) {
    const { profileId } = getTrackerSettings();
    const reply = chat[mesId];
    if (!reply || reply.is_user || !reply.mes) return;

    const { messages, scene } = buildTrackerMessages(mesId);
    const before = getProgressFingerprint();
    try {
        const response = await sendRequestWithReasoningRetry(profileId, messages, 700, { stream: false, extractData: true });
        const text = (response?.text || response?.content || '').trim();
        const result = robustParseJSON(text);
        if (!result || typeof result !== 'object') throw new Error('Tracker returned no JSON');

        // The chat may have moved on (swipe, delete) while we waited
        if (chat[mesId] !== reply) return;

        const signals = trackerResultToSignals(result, scene, getBeatState());
        if (signals.length) await applySignals(signals, { mesId });

        if (Array.isArray(result.ledger_add) && result.ledger_add.length) {
            await addLedgerEntries(result.ledger_add, { source: 'tracker', mesId });
        }
        await setFallback(false);
        await recordReplyProgress(before);
        console.debug('[Story Mode] Tracker applied', { signals, ledger: result.ledger_add?.length || 0 });
    } catch (error) {
        console.warn('[Story Mode] Secondary tracker failed; the next reply will use inline markers:', error);
        await setFallback(true);
        await recordReplyProgress(before);
        window.toastr?.warning('Story tracker call failed. The next reply will use inline markers instead.', 'Story Mode', { timeOut: 4000 });
    } finally {
        window.updateControllerPanel?.();
    }
}

/**
 * Track a reply with the secondary model, in the background. Calls queue,
 * so replies are always processed in order.
 * @param {number} mesId - Message index of the AI reply
 * @param {Function} applySignals - (signals, { mesId }) => Promise
 */
export function startSecondaryTracker(mesId, applySignals) {
    pendingCount++;
    pending = pending
        .then(() => runTracker(mesId, applySignals))
        .catch(error => console.error('[Story Mode] Tracker error:', error))
        .finally(() => { pendingCount--; });
}

/**
 * Wait for queued tracker work, bounded by the configured timeout.
 * @returns {Promise<void>}
 */
export async function waitForTracker() {
    if (pendingCount === 0) return;
    const { timeoutSeconds } = getTrackerSettings();
    let timer;
    await Promise.race([
        pending,
        new Promise(resolve => { timer = setTimeout(resolve, timeoutSeconds * 1000); }),
    ]);
    clearTimeout(timer);
}
