/**
 * Connection Management Module
 *
 * Two independent connections matter to the editor:
 *  - SillyTavern's server (CSRF token + file API): library load/save/import
 *  - an open SillyTavern tab running Story Mode (host bridge): generation,
 *    covers, characters and personas
 * The banner shows both, and the host check repeats so opening a
 * SillyTavern tab later enables generation without reloading.
 */

import { checkBackendConnection } from '../adapters/connection-bridge.js';
import { connectToHost, isHostAvailable } from '../adapters/host-bridge.js';

const HOST_RECHECK_MS = 15000;

let serverConnected = false;
let hostConnected = false;
let recheckTimer = null;

/**
 * Check both connections and update the banner.
 * @returns {Promise<boolean>} True if the SillyTavern server is reachable
 */
export async function checkConnection() {
    try {
        serverConnected = (await checkBackendConnection()).connected;
    } catch (error) {
        console.info('[Connection] Server check failed:', error.message);
        serverConnected = false;
    }
    hostConnected = await connectToHost();
    render();
    scheduleHostRecheck();
    return serverConnected;
}

function scheduleHostRecheck() {
    clearTimeout(recheckTimer);
    recheckTimer = setTimeout(async () => {
        const before = hostConnected;
        hostConnected = await connectToHost();
        if (hostConnected !== before) render();
        scheduleHostRecheck();
    }, HOST_RECHECK_MS);
}

function render() {
    const $banner = $('#connectionBanner');
    const ok = serverConnected;
    $banner.toggleClass('connected', ok).toggleClass('disconnected', !ok);
    $banner.find('.status-dot').toggleClass('online', ok);

    let message;
    if (!serverConnected) {
        message = 'Cannot reach SillyTavern. Open this editor from SillyTavern (Story Mode → Fullscreen Editor) while the server is running.';
    } else if (!hostConnected) {
        message = 'Connected to SillyTavern library · Keep a SillyTavern tab open to use AI generation and covers';
    } else {
        message = 'Connected to SillyTavern · AI generation available';
    }
    $('#connectionStatusText').text(message);
    $banner.css('cursor', serverConnected ? 'default' : 'pointer');

    $(document).trigger('connection:changed', { connected: serverConnected, host: hostConnected, message });
}

/** @returns {boolean} True if the SillyTavern server is reachable */
export function getConnectionStatus() {
    return serverConnected;
}

/** @returns {boolean} True if a SillyTavern tab with Story Mode answers */
export function getHostStatus() {
    return hostConnected && isHostAvailable();
}

/** Make the banner clickable to retry. */
export function initConnectionUI() {
    $('#connectionBanner').on('click', () => {
        if (!serverConnected || !hostConnected) checkConnection();
    });
}
