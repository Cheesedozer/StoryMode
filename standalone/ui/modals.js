/**
 * Modal Management Module
 * Handles settings modal and modal tab navigation
 */

import {
    getSettings,
    applyTheme,
    getCurrentTheme,
} from '../settings-system.js';
import { checkConnection, getConnectionStatus, getHostStatus } from './connection.js';

// ============================================================================
// SETTINGS MODAL
// ============================================================================

// Track original theme for revert on cancel
let originalTheme = null;

/**
 * Initialize modal event handlers
 */
export function initModals() {
    // Settings modal — use delegation on #settingsModal for reliable binding
    $('#settingsModal').on('click', '#saveSettingsBtn', saveSettings);
    $('#settingsModal').on('click', '#cancelSettingsBtn', closeSettingsModal);
    $('#settingsModal').on('click', '.modal-close', closeSettingsModal);
    $('#settingsModal').on('click', '[data-settings-tab]', handleSettingsTabClick);

    // Live theme preview
    $('#settingsModal').on('change', '#themeSelect', handleThemePreview);

    // Test connection button
    $('#settingsModal').on('click', '#testConnectionBtn', handleTestConnection);
}

/**
 * Open the settings modal
 */
export function openSettingsModal() {
    const settings = getSettings();
    originalTheme = getCurrentTheme();
    $('#themeSelect').val(settings.theme || 'dark');
    renderConnectionStatus();
    $('#settingsModal').css('display', 'flex');
}

function renderConnectionStatus() {
    const row = (ok, label, detail) => `<li><i class="fa-solid ${ok ? 'fa-circle-check' : 'fa-circle-xmark'}" style="color: ${ok ? '#51cf66' : '#ff6b6b'};"></i> <strong>${label}</strong>: ${detail}</li>`;
    $('#connectionTestResult').html(`<ul style="list-style: none; padding: 0; margin: 0; line-height: 1.8;">
        ${row(getConnectionStatus(), 'SillyTavern server', getConnectionStatus() ? 'reachable (library available)' : 'not reachable')}
        ${row(getHostStatus(), 'Story Mode tab', getHostStatus() ? 'open (AI generation, covers, characters)' : 'not found; open SillyTavern in another tab')}
    </ul>`);
}

/**
 * Close the settings modal
 * Reverts theme if cancelled
 */
export function closeSettingsModal() {
    // Revert theme to original if user cancelled
    if (originalTheme && getCurrentTheme() !== originalTheme) {
        applyTheme(originalTheme);
    }

    $('#settingsModal').hide();
    originalTheme = null;
}

/**
 * Save settings from modal
 */
function saveSettings() {
    applyTheme($('#themeSelect').val());
    originalTheme = null; // keep the new theme
    toastr.success('Settings saved');
    closeSettingsModal();
}

/**
 * Handle theme select change (live preview)
 * @param {Event} e - Change event
 */
function handleThemePreview(e) {
    const theme = $(e.target).val();
    applyTheme(theme);
}

/**
 * Re-run the connection checks and refresh the status list
 */
async function handleTestConnection() {
    const btn = $('#testConnectionBtn');
    btn.prop('disabled', true);
    $('#connectionTestResult').html('<i class="fa-solid fa-spinner fa-spin"></i> Checking...');
    try {
        await checkConnection();
    } finally {
        renderConnectionStatus();
        btn.prop('disabled', false);
    }
}

/**
 * Handle settings tab click
 * @param {Event} e - Click event
 */
function handleSettingsTabClick(e) {
    // jQuery .data() camelCases hyphenated attrs, so use .attr() instead
    const tab = $(e.currentTarget).attr('data-settings-tab');

    // Update tab buttons
    $('.modal-tab').removeClass('active');
    $(e.currentTarget).addClass('active');

    // Update tab content panels
    $('#settingsModal .tab-panel').removeClass('active');
    $(`#${tab}Tab`, '#settingsModal').addClass('active');
}

// ============================================================================
// HELP MODAL
// ============================================================================

/**
 * Show help dialog
 * @returns {boolean} False to prevent default
 */
export function showHelp() {
    $('#helpModal').css('display', 'flex');
    return false;
}
