/**
 * Host Bridge (standalone client side)
 *
 * Talks to the Story Mode extension running in an open SillyTavern tab over a
 * same-origin BroadcastChannel (see lib/bridge/standalone-host.js). Anything
 * that needs SillyTavern's in-page state goes through here: blueprint and
 * cover generation (with the user's connection profiles and image source),
 * loaded characters and personas, and the user's own story types and styles.
 *
 * Storage does not need the bridge: the editor reads and writes the library
 * directly through SillyTavern's file API.
 */

const BRIDGE_CHANNEL = 'storymode-standalone-bridge';
const PING_TIMEOUT_MS = 1500;
const DEFAULT_TIMEOUT_MS = 15000;

const clientId = `editor-${(crypto.randomUUID?.() || String(Math.random())).slice(0, 8)}`;
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(BRIDGE_CHANNEL) : null;

/** Pending requests: id -> { resolve, reject, timer, onEvent } */
const pending = new Map();
/** Listeners for host-initiated events: event -> Set<fn> */
const eventListeners = new Map();

let host = null; // { hostId, version, mainApi }
let requestCounter = 0;

channel?.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    if (msg.kind === 'response' && pending.has(msg.id)) {
        const entry = pending.get(msg.id);
        // ping responses come from every host; the first one wins
        if (entry.method !== 'ping' && msg.hostId !== host?.hostId) return;
        pending.delete(msg.id);
        clearTimeout(entry.timer);
        if (msg.ok) entry.resolve(msg.result);
        else entry.reject(new Error(msg.error || 'Request failed'));
        return;
    }

    if (msg.kind === 'event') {
        if (msg.source === clientId) return;
        if (msg.requestId && pending.has(msg.requestId)) {
            pending.get(msg.requestId).onEvent?.(msg.event, msg.data);
        }
        eventListeners.get(msg.event)?.forEach(fn => {
            try { fn(msg.data); } catch (error) { console.error('[HostBridge] Listener failed:', error); }
        });
    }
});

function send(method, params, { timeout = DEFAULT_TIMEOUT_MS, onEvent } = {}) {
    if (!channel) return Promise.reject(new Error('This browser does not support BroadcastChannel'));
    const id = `${clientId}-${++requestCounter}`;
    return new Promise((resolve, reject) => {
        const timer = timeout > 0
            ? setTimeout(() => {
                pending.delete(id);
                reject(new Error(method === 'ping'
                    ? 'No SillyTavern tab with Story Mode is open'
                    : `${method} timed out`));
            }, timeout)
            : null;
        pending.set(id, { resolve, reject, timer, onEvent, method });
        channel.postMessage({ kind: 'request', id, target: host?.hostId, method, params });
    });
}

/**
 * Look for an open SillyTavern tab running Story Mode.
 * @returns {Promise<boolean>} True if a host answered
 */
export async function connectToHost() {
    try {
        host = await send('ping', {}, { timeout: PING_TIMEOUT_MS });
    } catch {
        host = null;
    }
    return !!host;
}

/** @returns {boolean} Whether a SillyTavern tab is answering */
export function isHostAvailable() {
    return !!host;
}

async function call(method, params, options) {
    if (!host && !(await connectToHost())) {
        throw new Error('Open SillyTavern (with Story Mode enabled) in another tab to use this feature.');
    }
    return send(method, params, options);
}

/** Subscribe to host-initiated events (e.g. 'library-changed'). */
export function onHostEvent(eventName, fn) {
    if (!eventListeners.has(eventName)) eventListeners.set(eventName, new Set());
    eventListeners.get(eventName).add(fn);
    return () => eventListeners.get(eventName)?.delete(fn);
}

/** Tell the SillyTavern tab the library changed, so it reloads its manifest. */
export function notifyLibraryChanged() {
    channel?.postMessage({ kind: 'event', source: clientId, event: 'library-changed' });
}

export const getHostStyles = () => call('getStyles');
export const getHostCharacters = () => call('getCharacters');
export const getHostPersonas = () => call('getPersonas');

/**
 * Generate a blueprint in the SillyTavern tab.
 * @param {Object} form - Wizard form data
 * @param {Function} [onProgress] - (event, data) for 'phase-update' / 'generation-status'
 * @returns {Promise<Object>} Normalized blueprint
 */
export function generateBlueprintViaHost(form, onProgress) {
    // Generation can take minutes; rely on the host's own error handling
    return call('generateBlueprint', { form }, { timeout: 0, onEvent: onProgress });
}

/** Generate a cover in the SillyTavern tab. @returns {Promise<{imageUrl: string}>} */
export function generateCoverViaHost(blueprint, prompt = '', negative = '') {
    return call('generateCover', { blueprint, prompt, negative }, { timeout: 0 });
}
