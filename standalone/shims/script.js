/**
 * Shim for SillyTavern's `/script.js`, mapped via the import map in
 * standalone/index.html.
 *
 * Lets the standalone editor import the extension's own storage modules
 * (lib/blueprint/file-storage.js, manifest.js, codec.js) unchanged, so both
 * write the library in exactly the same format. Only the members those
 * modules use are provided.
 */

import { getRequestHeaders } from '../adapters/connection-bridge.js';

export { getRequestHeaders };

/** Minimal event emitter matching the parts of ST's eventSource that lib/ uses. */
class EventEmitter {
    constructor() {
        this.listeners = new Map();
    }

    on(event, fn) {
        if (!this.listeners.has(event)) this.listeners.set(event, new Set());
        this.listeners.get(event).add(fn);
    }

    off(event, fn) {
        this.listeners.get(event)?.delete(fn);
    }

    removeListener(event, fn) {
        this.off(event, fn);
    }

    async emit(event, ...args) {
        for (const fn of [...(this.listeners.get(event) || [])]) {
            try {
                await fn(...args);
            } catch (error) {
                console.error(`[Standalone] Listener for ${event} failed:`, error);
            }
        }
    }
}

export const eventSource = new EventEmitter();
