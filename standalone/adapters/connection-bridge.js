/**
 * Connection Bridge Module
 * Handles CSRF authentication and communication with SillyTavern backend.
 *
 * SillyTavern protects all API endpoints with CSRF tokens.
 * This module fetches the token on connect and provides
 * authenticated request headers to all other modules.
 */

import { connectToHost, isHostAvailable, getHostStyles, generateBlueprintViaHost, generateCoverViaHost } from './host-bridge.js';

// All API calls use relative URLs: the editor is served from within
// SillyTavern (same-origin).

// ============================================================================
// CONNECTION STATE
// ============================================================================

let connectionStatus = 'unknown'; // 'unknown', 'connected', 'disconnected', 'error'
let csrfToken = null;

// ============================================================================
// CSRF TOKEN
// ============================================================================

/**
 * Fetch a CSRF token from SillyTavern.
 * Uses a relative URL since the standalone editor is served from within
 * SillyTavern — this guarantees same-origin and avoids CORS issues.
 * @returns {Promise<string|null>} CSRF token or null
 */
async function fetchCsrfToken() {
    try {
        const response = await fetch('/csrf-token', {
            method: 'GET',
            signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
            const data = await response.json();
            csrfToken = data.token;
            console.log('[Connection] CSRF token acquired');
            return csrfToken;
        }
    } catch (error) {
        console.warn('[Connection] Failed to fetch CSRF token:', error.message);
    }

    return null;
}

/**
 * Get request headers with CSRF token (mirrors SillyTavern's getRequestHeaders)
 * @param {Object} options
 * @param {boolean} options.omitContentType - Skip Content-Type header
 * @returns {Object} Headers object
 */
export function getRequestHeaders({ omitContentType = false } = {}) {
    const headers = {};

    if (!omitContentType) {
        headers['Content-Type'] = 'application/json';
    }

    if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
    }

    return headers;
}

/**
 * Get the current CSRF token
 * @returns {string|null} CSRF token
 */
export function getCsrfToken() {
    return csrfToken;
}

// ============================================================================
// CONNECTION CHECKING
// ============================================================================

/**
 * Check backend connection by fetching CSRF token
 * If we can get a token, we're connected.
 * @returns {Promise<Object>} Connection status
 */
export async function checkBackendConnection() {
    try {
        const token = await fetchCsrfToken();

        if (token) {
            connectionStatus = 'connected';
            return { connected: true };
        } else {
            connectionStatus = 'error';
            return { connected: false };
        }
    } catch (error) {
        console.error('[Connection] Backend check failed:', error);
        connectionStatus = 'error';
        csrfToken = null;
        return { connected: false };
    }
}

/**
 * Get the current connection status
 * @returns {string} Connection status
 */
export function getConnectionStatus() {
    return connectionStatus;
}

/**
 * Check if connected
 * @returns {boolean} True if connected with valid CSRF token
 */
export function isConnected() {
    return connectionStatus === 'connected' && csrfToken !== null;
}

// ============================================================================
// AUTHENTICATED FETCH
// ============================================================================

/**
 * Make an authenticated fetch request to SillyTavern
 * Automatically includes CSRF token header
 * @param {string} url - Full URL
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
export async function authenticatedFetch(url, options = {}) {
    const headers = {
        ...getRequestHeaders(),
        ...options.headers,
    };

    return fetch(url, { ...options, headers });
}

// ============================================================================
// DATA LOADERS (story types, author styles)
// ============================================================================

/** Cache for loaded style lists */
const dataCache = {};

/** User data files written by the extension (lib/core/file-backed-data.js) */
const USER_DATA_FILES = {
    'story_types.json': 'storymode-story-types.json',
    'author_styles.json': 'storymode-author-styles.json',
};

/**
 * Load a style list, preferring the user's own data:
 * 1. the open SillyTavern tab (includes unsaved edits and custom entries)
 * 2. the user's saved file in user/files/
 * 3. the defaults bundled with the extension
 * @param {string} filename - Bundled data filename
 * @param {string} hostKey - Key in the host's getStyles() result
 * @returns {Promise<Array>}
 */
async function loadStyleList(filename, hostKey) {
    if (dataCache[filename]) return dataCache[filename];

    try {
        if (isHostAvailable() || await connectToHost()) {
            const styles = await getHostStyles();
            if (Array.isArray(styles?.[hostKey]) && styles[hostKey].length) {
                return (dataCache[filename] = styles[hostKey]);
            }
        }
    } catch (error) {
        console.warn(`[Connection] Could not get ${hostKey} from SillyTavern tab:`, error.message);
    }

    try {
        const response = await fetch(`/user/files/${USER_DATA_FILES[filename]}?t=${Date.now()}`);
        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && data.length) return (dataCache[filename] = data);
        }
    } catch { /* fall through to bundled defaults */ }

    const response = await fetch(new URL(`../../data/${filename}`, import.meta.url).href);
    if (!response.ok) {
        throw new Error(`Failed to load ${filename}: ${response.statusText}`);
    }
    return (dataCache[filename] = await response.json());
}

/** @returns {Promise<Array>} Story type definitions */
export function getStoryTypes() {
    return loadStyleList('story_types.json', 'storyTypes');
}

/** @returns {Promise<Array>} Author style definitions */
export function getAuthorStyles() {
    return loadStyleList('author_styles.json', 'authorStyles');
}

// ============================================================================
// GENERATION (runs in the open SillyTavern tab)
// ============================================================================

/**
 * Generate a blueprint using the user's SillyTavern connection settings.
 * @param {Object} form - Wizard form data
 * @param {Function} [onProgress] - Progress callback (event, data)
 * @returns {Promise<Object>} Generated blueprint
 */
export function generateBlueprint(form, onProgress) {
    return generateBlueprintViaHost(form, onProgress);
}

/**
 * Generate a cover image with SillyTavern's configured image source.
 * @param {Object} blueprint
 * @param {string} [prompt] - Custom positive prompt (else the blueprint's cover prompt)
 * @param {string} [negative] - Negative prompt
 * @returns {Promise<string>} Image URL (data: or server path)
 */
export async function generateCover(blueprint, prompt = '', negative = '') {
    const { imageUrl } = await generateCoverViaHost(blueprint, prompt, negative);
    return imageUrl;
}

// ============================================================================
// EXPORT FOR DEBUGGING
// ============================================================================

if (typeof window !== 'undefined' && window.location?.hostname === 'localhost') {
    window.StoryModeConnection = {
        checkBackendConnection,
        getConnectionStatus,
        isConnected,
        getCsrfToken,
        getRequestHeaders,
        authenticatedFetch,
    };
}
