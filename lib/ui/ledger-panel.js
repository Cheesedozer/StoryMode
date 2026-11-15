/**
 * Story Ledger UI
 *
 * A controller panel section and a popout where the player can read, edit,
 * add and delete ledger entries. Both are shown only when the player turns
 * on "Show Story Ledger" (settings.ledger.visible, off by default). The
 * ledger is sent to the narrator either way.
 *
 * @module ui/ledger-panel
 */

import {
    getLedger,
    getActiveLedgerEntries,
    isEntryActive,
    addLedgerEntries,
    updateLedgerEntry,
    deleteLedgerEntry,
    LEDGER_TYPES,
} from '../story/ledger.js';
import { updateStoryPrompt } from '../core/arc-engine.js';
import { escapeHtml } from './component-system.js';
import { createThemedPopout } from './controller-panel-structure.js';

const SOURCE_LABELS = { tracker: 'tracker', narrator: 'narrator', player: 'you' };

/**
 * Controller panel section, or '' when the ledger is hidden.
 * @param {Object} settings - Extension settings
 * @returns {string} HTML
 */
export function buildLedgerSection(settings) {
    if (settings.ledger?.visible !== true) return '';
    const active = getActiveLedgerEntries();
    const latest = active[active.length - 1];
    return `
        <div id="storymode-debug-ledger-link" class="storymode-debug-section storymode-debug-interactable" title="Click to view and edit the story ledger">
            <div class="storymode-debug-label">Story Ledger <i class="fa-solid fa-magnifying-glass"></i></div>
            <div class="storymode-debug-value">${active.length} ${active.length === 1 ? 'entry' : 'entries'}</div>
            ${latest ? `<div class="storymode-debug-meta">Latest: ${escapeHtml(latest.text)}</div>` : ''}
        </div>
    `;
}

function typeOptions(selected) {
    return LEDGER_TYPES.map(t => `<option value="${t}" ${t === selected ? 'selected' : ''}>${t}</option>`).join('');
}

function buildEntryCard(entry) {
    const active = isEntryActive(entry);
    const meta = [
        `scene ${(entry.scene ?? 0) + 1}`,
        `from ${SOURCE_LABELS[entry.source] || entry.source || 'unknown'}`,
        active ? '' : 'inactive: its reply was swiped or deleted',
    ].filter(Boolean).join(' · ');

    return `
        <div class="storymode-summary-card storymode-ledger-card ${active ? '' : 'inactive'}" data-ledger-id="${escapeHtml(entry.id)}">
            <div class="storymode-summary-card-header">
                <span class="storymode-summary-scene-title">${escapeHtml(entry.type)}</span>
                <span class="storymode-summary-timestamp">${escapeHtml(meta)}</span>
            </div>
            <div class="storymode-summary-card-body">
                <textarea class="storymode-summary-textarea" data-ledger-field="text">${escapeHtml(entry.text)}</textarea>
                <div class="storymode-ledger-row">
                    <select data-ledger-field="type">${typeOptions(entry.type)}</select>
                    <input type="text" data-ledger-field="who_knows" placeholder="Known to (comma separated)" value="${escapeHtml((entry.who_knows || []).join(', '))}">
                </div>
                <div class="storymode-ledger-row">
                    <input type="text" data-ledger-field="tags" placeholder="Tags (comma separated)" title="Tags are what complications and endings check" value="${escapeHtml((entry.tags || []).join(', '))}">
                </div>
            </div>
            <div class="storymode-summary-card-actions">
                <button class="storymode-small-btn storymode-ledger-delete" title="Delete this entry"><i class="fa-solid fa-trash"></i> Delete</button>
                <button class="storymode-small-btn storymode-ledger-save" disabled><i class="fa-solid fa-save"></i> Save</button>
            </div>
        </div>
    `;
}

function buildNewEntryCard() {
    return `
        <div class="storymode-summary-card storymode-ledger-card storymode-ledger-new">
            <div class="storymode-summary-card-header">
                <span class="storymode-summary-scene-title"><i class="fa-solid fa-plus"></i> Add an entry</span>
            </div>
            <div class="storymode-summary-card-body">
                <textarea class="storymode-summary-textarea" data-ledger-field="text" placeholder="One sentence: who did what, or what is now true."></textarea>
                <div class="storymode-ledger-row">
                    <select data-ledger-field="type">${typeOptions('fact')}</select>
                    <input type="text" data-ledger-field="who_knows" placeholder="Known to (comma separated)">
                </div>
                <div class="storymode-ledger-row">
                    <input type="text" data-ledger-field="tags" placeholder="Tags (comma separated)" title="Tags are what complications and endings check">
                </div>
            </div>
            <div class="storymode-summary-card-actions">
                <button class="storymode-small-btn storymode-ledger-add"><i class="fa-solid fa-plus"></i> Add</button>
            </div>
        </div>
    `;
}

function readCard($card) {
    return {
        text: $card.find('[data-ledger-field="text"]').val(),
        type: $card.find('[data-ledger-field="type"]').val(),
        who_knows: String($card.find('[data-ledger-field="who_knows"]').val() || '')
            .split(',').map(s => s.trim()).filter(Boolean),
        tags: String($card.find('[data-ledger-field="tags"]').val() || '')
            .split(',').map(s => s.trim()).filter(Boolean),
    };
}

function renderBody() {
    // Newest first; inactive entries stay visible so a swipe back is not a surprise
    const entries = [...getLedger()].reverse();
    const list = entries.length
        ? entries.map(buildEntryCard).join('')
        : '<p class="storymode-summary-empty">Nothing recorded yet. Entries appear as the story establishes choices, promises and secrets.</p>';
    return `
        <p class="storymode-ledger-intro">What the story has established. The narrator sees active entries every turn, and their tags decide which complications can arrive and which ending the story moves toward. Editing an entry makes it yours, so it stays even if its reply is swiped away.</p>
        ${buildNewEntryCard()}
        ${list}
    `;
}

async function afterChange(popout) {
    popout.find('.storymode-summary-popout-body').html(renderBody());
    await updateStoryPrompt();
    window.updateControllerPanel?.();
}

/**
 * Open the ledger popout.
 */
export function showLedgerPopup() {
    const contentHtml = `
        <div class="storymode-summary-popout-header">
            <i class="fa-solid fa-book-open"></i>
            <span>Story Ledger</span>
            <button class="storymode-summary-popout-close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="storymode-summary-popout-body">${renderBody()}</div>
    `;

    const popout = createThemedPopout(
        'storymode-ledger-popout',
        contentHtml,
        '.storymode-summary-popout-header',
        '.storymode-summary-popout-close',
        'ledgerPopout',
    );

    popout.on('input change', '.storymode-ledger-card:not(.storymode-ledger-new) [data-ledger-field]', function () {
        $(this).closest('.storymode-ledger-card').find('.storymode-ledger-save').prop('disabled', false);
    });

    popout.on('click', '.storymode-ledger-save', async function () {
        const $card = $(this).closest('.storymode-ledger-card');
        const ok = await updateLedgerEntry($card.data('ledger-id'), readCard($card));
        if (!ok) {
            window.toastr?.warning('An entry needs some text.');
            return;
        }
        await afterChange(popout);
    });

    popout.on('click', '.storymode-ledger-delete', async function () {
        const $card = $(this).closest('.storymode-ledger-card');
        await deleteLedgerEntry($card.data('ledger-id'));
        await afterChange(popout);
    });

    popout.on('click', '.storymode-ledger-add', async function () {
        const $card = $(this).closest('.storymode-ledger-card');
        const added = await addLedgerEntries([readCard($card)], { source: 'player' });
        if (!added.length) {
            window.toastr?.info('Nothing added: the entry is empty or already recorded.');
            return;
        }
        await afterChange(popout);
    });
}
