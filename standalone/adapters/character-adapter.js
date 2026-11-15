/**
 * Character Adapter Module
 * Read-only access to SillyTavern characters and personas.
 *
 * Prefers the open SillyTavern tab (via the host bridge), which already has
 * every character and persona loaded. Without it, characters fall back to
 * SillyTavern's /api/characters/all endpoint; personas need the tab.
 */

import { getRequestHeaders, isConnected } from './connection-bridge.js';
import { isHostAvailable, connectToHost, getHostCharacters, getHostPersonas } from './host-bridge.js';

/**
 * @returns {Promise<Array<{avatar: string, name: string, description: string, personality: string}>>}
 */
export async function getCharacters() {
    try {
        if (isHostAvailable() || await connectToHost()) {
            return await getHostCharacters();
        }
    } catch (error) {
        console.warn('[Character Adapter] Host request failed, using server API:', error.message);
    }

    if (!isConnected()) return [];

    try {
        const response = await fetch('/api/characters/all', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({}),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return (Array.isArray(data) ? data : data.characters || []).map(c => ({
            avatar: c.avatar,
            name: c.name,
            description: c.description || c.data?.description || '',
            personality: c.personality || c.data?.personality || '',
        }));
    } catch (error) {
        console.error('[Character Adapter] Error fetching characters:', error);
        return [];
    }
}

/**
 * @returns {Promise<{current: string|null, personas: Array<{id: string, name: string, description: string}>}>}
 */
export async function getPersonas() {
    try {
        if (isHostAvailable() || await connectToHost()) {
            return await getHostPersonas();
        }
    } catch (error) {
        console.warn('[Character Adapter] Could not load personas:', error.message);
    }
    return { current: null, personas: [] };
}
