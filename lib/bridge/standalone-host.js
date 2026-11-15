/**
 * Standalone Editor Bridge (host side)
 *
 * The standalone editor runs in its own browser tab, so it cannot call
 * SillyTavern's in-page APIs (connection profiles, presets, the image
 * generation extension, loaded characters and personas). This module runs in
 * the SillyTavern tab and answers the editor's requests over a same-origin
 * BroadcastChannel, using the same code paths the extension itself uses.
 *
 * Protocol (see standalone/adapters/host-bridge.js for the client):
 *   client → { kind: 'request', id, target, method, params }
 *   host   → { kind: 'response', id, hostId, ok, result | error }
 *   either → { kind: 'event', source, event, data }
 * A `ping` request is answered by every open SillyTavern tab; the client
 * then addresses all further requests to one `hostId`, so a generation only
 * runs once even with several SillyTavern tabs open.
 *
 * @module bridge/standalone-host
 */

import { characters, eventSource, main_api } from '/script.js';
import { power_user } from '/scripts/power-user.js';
import { user_avatar } from '/scripts/personas.js';

import { getStoryTypes, getAuthorStyles, getConnectionProfiles } from '../core/state-manager.js';
import * as BlueprintModule from '../blueprint/module.js';
import { reloadManifest } from '../blueprint/manifest.js';
import { LIBRARY_EVENTS } from '../blueprint/file-storage.js';
import { generateCoverFromSD } from '../editor/blueprint-editor.js';

export const BRIDGE_CHANNEL = 'storymode-standalone-bridge';
export const BRIDGE_VERSION = 1;

const hostId = (crypto.randomUUID?.() || String(Math.random())).slice(0, 8);
let channel = null;

/**
 * Convert the standalone wizard's form data into the extension's blueprint
 * request (the same shape lib/dialog/wizard.js produces).
 * @param {Object} form - Standalone wizard data
 * @returns {Object} Request for BlueprintModule.generateBlueprint()
 */
export function buildRequestFromStandalone(form) {
    const scenarioParts = [
        form.core_premise,
        form.genre && `Genre: ${form.genre}`,
        form.tone && `Tone: ${form.tone}`,
        (form.setting?.location || form.setting?.time_period) &&
            `Setting: ${[form.setting.location, form.setting.time_period].filter(Boolean).join(', ')}`,
        form.protagonist_description && `About the protagonist: ${form.protagonist_description}`,
        form.antagonist_description && `Opposition: ${form.antagonist_description}`,
        form.additional_notes,
    ].filter(Boolean);

    const characterData = (form.character_avatars || [])
        .map(avatar => characters.find(c => c.avatar === avatar))
        .filter(Boolean)
        .map(c => ({
            name: c.name,
            description: c.description,
            personality: c.personality,
            scenario: c.scenario,
            greeting: c.first_mes,
        }));

    const personaData = form.persona_id
        ? [{ id: form.persona_id, name: power_user.personas?.[form.persona_id] || form.persona_id }]
        : [];

    const request = BlueprintModule.buildBlueprintRequest({
        storyTypeId: form.story_type_id,
        authorStyleId: form.author_style || undefined,
        characterData,
        personaData,
        scenario: scenarioParts.join('\n\n'),
        messageTarget: parseInt(form.scene_count, 10) || 10,
        metaphorLevel: form.metaphor_level || 'mixed',
    });

    if (form.embedded_lorebook) request.embedded_lorebook = form.embedded_lorebook;
    if (form.linked_lorebooks?.length) request.linked_lorebooks = form.linked_lorebooks;
    return request;
}

// ============================================================================
// REQUEST HANDLERS
// ============================================================================

const handlers = {
    ping() {
        return { hostId, version: BRIDGE_VERSION, mainApi: main_api || null };
    },

    getStyles() {
        return { storyTypes: getStoryTypes(), authorStyles: getAuthorStyles() };
    },

    getCharacters() {
        return characters.map(c => ({
            avatar: c.avatar,
            name: c.name,
            description: c.description || '',
            personality: c.personality || '',
        }));
    },

    getPersonas() {
        const names = power_user.personas || {};
        const descriptions = power_user.persona_descriptions || {};
        return {
            current: user_avatar || null,
            personas: Object.entries(names).map(([id, name]) => ({
                id,
                name,
                description: descriptions[id]?.description || '',
            })),
        };
    },

    getProfiles() {
        return getConnectionProfiles().map(p => ({ id: p.id, name: p.name, model: p.model || '' }));
    },

    async generateBlueprint({ form }, notify) {
        const request = buildRequestFromStandalone(form);

        // Forward the generator's progress events to the editor while it runs
        const onPhase = data => notify('phase-update', {
            phase: data.phase,
            progress: data.progress,
            error: data.error?.error || null,
        });
        const onStatus = data => notify('generation-status', { type: data.type, message: data.message });
        eventSource.on('STORY_MODE_PHASE_UPDATE', onPhase);
        eventSource.on('STORY_MODE_GENERATION_STATUS', onStatus);

        try {
            const result = await BlueprintModule.generateBlueprint(request, getStoryTypes(), getAuthorStyles(), {});
            if (!result.success) {
                throw new Error(result.error || `Generation failed in phase ${result.phase ?? '?'}`);
            }
            return BlueprintModule.normalizeBlueprint(result.blueprint);
        } finally {
            eventSource.removeListener('STORY_MODE_PHASE_UPDATE', onPhase);
            eventSource.removeListener('STORY_MODE_GENERATION_STATUS', onStatus);
        }
    },

    async generateCover({ blueprint, prompt, negative }) {
        // A prompt typed in the editor replaces the stored/auto-generated one
        if (prompt) {
            blueprint.metadata = { ...(blueprint.metadata || {}), coverPrompt: { positive: prompt, negative: negative || '' } };
        }
        const result = await generateCoverFromSD(blueprint);
        if (!result?.success || !result.imageUrl) {
            throw new Error(result?.error || 'Image generation returned no image. Is an image generation source configured in SillyTavern?');
        }
        return { imageUrl: result.imageUrl };
    },
};

// ============================================================================
// CHANNEL
// ============================================================================

function post(message) {
    try {
        channel?.postMessage(message);
    } catch (error) {
        console.error('[Story Mode Bridge] Failed to post message:', error);
    }
}

async function onMessage(event) {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    // Library changed in the editor: drop our cached manifest so our next
    // save doesn't overwrite the editor's change
    if (msg.kind === 'event' && msg.event === 'library-changed' && msg.source !== hostId) {
        try {
            await reloadManifest();
        } catch (error) {
            console.warn('[Story Mode Bridge] Manifest reload failed:', error);
        }
        return;
    }

    if (msg.kind !== 'request') return;
    if (msg.method !== 'ping' && msg.target !== hostId) return;

    const handler = handlers[msg.method];
    if (!handler) {
        post({ kind: 'response', id: msg.id, hostId, ok: false, error: `Unknown method: ${msg.method}` });
        return;
    }

    const notify = (eventName, data) => post({ kind: 'event', source: hostId, requestId: msg.id, event: eventName, data });

    try {
        const result = await handler(msg.params || {}, notify);
        post({ kind: 'response', id: msg.id, hostId, ok: true, result });
    } catch (error) {
        console.error(`[Story Mode Bridge] ${msg.method} failed:`, error);
        post({ kind: 'response', id: msg.id, hostId, ok: false, error: error?.message || String(error) });
    }
}

/**
 * Tell open editor tabs that the library changed in this tab.
 */
export function notifyLibraryChanged() {
    post({ kind: 'event', source: hostId, event: 'library-changed' });
}

/**
 * Start answering standalone editor requests. Safe to call more than once.
 */
export function initStandaloneBridgeHost() {
    if (channel || typeof BroadcastChannel === 'undefined') return;
    channel = new BroadcastChannel(BRIDGE_CHANNEL);
    channel.addEventListener('message', onMessage);
    // Tell open editors when this tab changes the library
    Object.values(LIBRARY_EVENTS).forEach(evt => eventSource.on(evt, notifyLibraryChanged));
    console.log(`[Story Mode Bridge] Standalone editor bridge ready (host ${hostId})`);
}
