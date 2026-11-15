/**
 * UI Helper Functions for Story Mode Extension
 * Utility functions for HTML rendering and DOM manipulation
 */

import { escapeHtml } from '../component-system.js';

/**
 * Create a help icon HTML with tooltip
 * @param {string} helpText - The help text for the tooltip
 * @param {string} [iconClass='fa-circle-info'] - Font Awesome icon class
 * @returns {string} HTML string for the help icon
 */
export function createHelpIcon(helpText, iconClass = 'fa-solid fa-circle-info') {
    const escapedText = escapeHtml(helpText);
    return `<i class="${iconClass} sm-help-icon" title="${escapedText}"></i>`;
}

/**
 * Create a help icon HTML with tooltip from an array of lines
 * @param {string[]} lines - Array of help text lines (will be bullet-pointed)
 * @param {string} [iconClass='fa-circle-info'] - Font Awesome icon class
 * @returns {string} HTML string for the help icon
 */
export function createHelpIconFromLines(lines, iconClass = 'fa-solid fa-circle-info') {
    const text = lines.map(line => `• ${line}`).join('\n');
    return createHelpIcon(text, iconClass);
}

