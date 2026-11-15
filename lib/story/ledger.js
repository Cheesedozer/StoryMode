/**
 * Story Ledger
 *
 * A structured record of what the player did and what changed, fed back to
 * the narrator every turn so choices keep mattering. Entries live in the
 * single play state (chatState.scenario.ledger).
 *
 * Entries written by the tracker or the narrator remember the message and
 * swipe they came from. An entry only counts while that exact message and
 * swipe are in the chat, so swiping, regenerating or deleting a reply
 * automatically retires what it recorded, and swiping back restores it.
 * Entries the player writes are always active.
 *
 * Entry shape:
 *   { id, type, text, tags[], who_knows[], scene, source, mesId, swipeId, sendDate, createdAt }
 *
 * @module story/ledger
 */

import { chat } from '/script.js';
import { getChatStoryState, saveChatStoryState, getCurrentSceneIndex, getPacingMode } from '../core/state-manager.js';
import { getBlueprintState } from '../blueprint/storage.js';
import { getChapterIndexForScene } from './chapters.js';

export const LEDGER_TYPES = ['choice', 'fact', 'relationship', 'promise', 'item', 'world', 'note', 'summary'];

const MAX_TEXT = 300;
const MAX_SUMMARY_TEXT = 900;
const MAX_TAGS = 5;
const MAX_WHO = 6;

function ledgerArray() {
    const state = getChatStoryState();
    if (!Array.isArray(state.scenario.ledger)) state.scenario.ledger = [];
    return state.scenario.ledger;
}

function save() {
    return saveChatStoryState(getChatStoryState());
}

function newId() {
    return (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`).slice(0, 13);
}

const normalizeText = (t, max = MAX_TEXT) => String(t || '').trim().replace(/\s+/g, ' ').slice(0, max);
const toTag = t => String(t || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/**
 * Clean an entry from the tracker, narrator or player.
 * @returns {Object|null} Normalized fields, or null when there is no text
 */
export function normalizeEntry(raw) {
    const text = normalizeText(raw?.text, raw?.type === 'summary' ? MAX_SUMMARY_TEXT : MAX_TEXT);
    if (!text) return null;
    return {
        type: LEDGER_TYPES.includes(raw.type) ? raw.type : 'note',
        text,
        tags: [...new Set((Array.isArray(raw.tags) ? raw.tags : []).map(toTag).filter(Boolean))].slice(0, raw.type === 'summary' ? 40 : MAX_TAGS),
        who_knows: (Array.isArray(raw.who_knows) ? raw.who_knows : [])
            .map(w => normalizeText(w).slice(0, 60)).filter(Boolean).slice(0, raw.type === 'summary' ? 20 : MAX_WHO),
    };
}

/**
 * Whether an entry still applies to the chat as it stands.
 * @param {Object} entry
 * @returns {boolean}
 */
export function isEntryActive(entry) {
    if (entry.source === 'player' || entry.mesId === undefined || entry.mesId === null) return true;
    const message = chat?.[entry.mesId];
    if (!message) return false;
    if (entry.sendDate !== undefined && message.send_date !== entry.sendDate) return false;
    return (message.swipe_id ?? 0) === (entry.swipeId ?? 0);
}

/** @returns {Array<Object>} Every stored entry, oldest first */
export function getLedger() {
    return ledgerArray();
}

/**
 * Entries that apply to the chat as it stands, oldest first. Entries folded
 * into a chapter summary are left out; the summary carries their tags.
 * @returns {Array<Object>}
 */
export function getActiveLedgerEntries() {
    return ledgerArray().filter(e => !e.compactedInto && isEntryActive(e));
}

/** The chapter of the current scene, when a blueprint with scenes is playing. */
function currentChapter() {
    if (getPacingMode() !== 'scenario') return undefined;
    const { blueprint, useBlueprint } = getBlueprintState();
    if (!useBlueprint || !blueprint?.scene_plan?.length) return undefined;
    return getChapterIndexForScene(blueprint, getCurrentSceneIndex());
}

/**
 * Add entries. Duplicates of an active entry (same text) are skipped.
 * @param {Array<Object>} entries - Raw entries ({ type, text, tags, who_knows })
 * @param {Object} origin
 * @param {'tracker'|'narrator'|'player'} origin.source
 * @param {number} [origin.mesId] - Message the entries came from
 * @returns {Promise<Array<Object>>} The entries actually added
 */
export async function addLedgerEntries(entries, { source, mesId } = {}) {
    const ledger = ledgerArray();
    const message = mesId !== undefined && mesId !== null ? chat?.[mesId] : null;
    const existing = new Set(getActiveLedgerEntries().map(e => e.text.toLowerCase()));
    const added = [];

    for (const raw of entries || []) {
        const clean = normalizeEntry(raw);
        if (!clean || existing.has(clean.text.toLowerCase())) continue;
        existing.add(clean.text.toLowerCase());
        const entry = {
            id: newId(),
            ...clean,
            scene: getCurrentSceneIndex(),
            chapter: currentChapter(),
            source: source || 'tracker',
            createdAt: Date.now(),
        };
        if (message) {
            entry.mesId = mesId;
            entry.swipeId = message.swipe_id ?? 0;
            entry.sendDate = message.send_date;
        }
        ledger.push(entry);
        added.push(entry);
    }

    if (added.length) await save();
    return added;
}

/**
 * Edit an entry. Editing makes it the player's: it stays active even if the
 * reply it came from is swiped away.
 * @param {string} id
 * @param {Object} patch - { type?, text?, tags?, who_knows? }
 * @returns {Promise<boolean>}
 */
export async function updateLedgerEntry(id, patch) {
    const entry = ledgerArray().find(e => e.id === id);
    if (!entry) return false;
    const merged = normalizeEntry({ ...entry, ...patch });
    if (!merged) return false;
    Object.assign(entry, merged, { source: 'player' });
    delete entry.mesId;
    delete entry.swipeId;
    delete entry.sendDate;
    await save();
    return true;
}

/**
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteLedgerEntry(id) {
    const ledger = ledgerArray();
    const index = ledger.findIndex(e => e.id === id);
    if (index < 0) return false;
    // Deleting a chapter summary gives its entries back
    if (ledger[index].type === 'summary') return unfoldSummary(id);
    ledger.splice(index, 1);
    await save();
    return true;
}

/**
 * Prompt block with what the story has established, newest entries kept
 * when over budget.
 * @param {number} [budgetTokens=400]
 * @returns {string} XML block, or '' when the ledger is empty
 */
export function buildLedgerXml(budgetTokens = 400) {
    const entries = getActiveLedgerEntries();
    if (!entries.length) return '';

    const budgetChars = Math.max(200, budgetTokens * 4);
    const lines = [];
    let used = 0;
    for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        const who = e.who_knows?.length ? ` (known to: ${e.who_knows.join(', ')})` : '';
        const label = e.type === 'summary' ? `chapter ${(e.chapter ?? 0) + 1} summary` : e.type;
        const line = `- [${label}] ${e.text}${who}`;
        if (used + line.length > budgetChars && lines.length) break;
        lines.unshift(line);
        used += line.length + 1;
    }
    const omitted = entries.length - lines.length;
    const header = omitted > 0 ? `(${omitted} earlier entries not shown)\n` : '';

    return `<what_is_true_now note="What the story has established, including {{user}}'s choices. Keep it consistent, and let it shape how characters treat {{user}}. Information only reaches characters who know it.">
${header}${lines.join('\n')}
</what_is_true_now>`;
}

// ============================================================================
// CHAPTER COMPACTION
// ============================================================================

/**
 * Entries of a finished chapter that could be folded into a summary.
 * @param {number} chapter
 * @returns {Array<Object>}
 */
export function getCompactableEntries(chapter) {
    return getActiveLedgerEntries().filter(e => e.chapter === chapter && e.type !== 'summary');
}

/**
 * Fold a chapter's entries into one summary entry. The summary keeps every
 * tag and everyone who knows, so conditions and knowledge are unchanged; the
 * originals stay stored and can be unfolded.
 * @param {number} chapter
 * @param {string} text - Summary text (from the summarizer)
 * @returns {Promise<Object|null>} The summary entry
 */
export async function compactChapter(chapter, text) {
    const entries = getCompactableEntries(chapter);
    const clean = normalizeEntry({
        type: 'summary',
        text,
        tags: entries.flatMap(e => e.tags || []),
        who_knows: entries.flatMap(e => e.who_knows || []),
    });
    if (!entries.length || !clean) return null;
    const summary = { id: newId(), ...clean, scene: entries[entries.length - 1].scene, chapter, source: 'summary', createdAt: Date.now() };
    entries.forEach(e => { e.compactedInto = summary.id; });
    // Keep the ledger chronological: the summary sits where its chapter began
    const ledger = ledgerArray();
    ledger.splice(Math.max(0, ledger.indexOf(entries[0])), 0, summary);
    await save();
    return summary;
}

/**
 * Undo a chapter summary: delete it and restore the entries it folded.
 * @param {string} summaryId
 * @returns {Promise<boolean>}
 */
export async function unfoldSummary(summaryId) {
    const ledger = ledgerArray();
    const index = ledger.findIndex(e => e.id === summaryId && e.type === 'summary');
    if (index < 0) return false;
    ledger.splice(index, 1);
    ledger.forEach(e => { if (e.compactedInto === summaryId) delete e.compactedInto; });
    await save();
    return true;
}
