/**
 * Structure editor: HTML for each section.
 *
 * Inputs carry data-path (where they write in the blueprint) and data-kind
 * (how the value is read); buttons and structural selects carry data-action.
 * See structure-editor.js for the event handling.
 *
 * @module editor/structure/sections
 */

import { listShapes, MAX_THREADS } from '../../story/shapes.js';
import { getChapters, hasChapters } from '../../story/chapters.js';
import { listEndings } from '../../story/story-events.js';
import { getEditableArcs, getStageOptions, getVocabulary, checkStructure, countUntaggedChoices } from './model.js';

export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Host-specific classes, so each editor's own form styles apply. */
export const DEFAULT_CLASSES = { input: '', select: '', textarea: '', button: '', danger: '' };

function field(c, label, inner, hint = '') {
    return `<label class="sm-st-field"><span class="sm-st-label">${esc(label)}</span>${inner}${hint ? `<small class="sm-st-hint">${esc(hint)}</small>` : ''}</label>`;
}

const textInput = (c, path, value, placeholder = '') =>
    `<input type="text" class="${c.input}" data-path="${esc(path)}" data-kind="text" value="${esc(value)}" placeholder="${esc(placeholder)}">`;

const textArea = (c, path, value, rows = 2, kind = 'text', placeholder = '') =>
    `<textarea class="${c.textarea}" rows="${rows}" data-path="${esc(path)}" data-kind="${kind}" placeholder="${esc(placeholder)}">${esc(Array.isArray(value) ? value.join(kind === 'csv' ? ', ' : '\n') : value)}</textarea>`;

const button = (c, action, label, attrs = '', extraClass = '') =>
    `<button type="button" class="${c.button} ${extraClass}" data-action="${action}" ${attrs}>${label}</button>`;

function section(id, icon, title, body, open, badge = '') {
    return `<details class="sm-st-section" data-section="${id}" ${open ? 'open' : ''}>
        <summary><i class="fa-solid ${icon}"></i> ${esc(title)}${badge ? ` <span class="sm-st-badge">${esc(badge)}</span>` : ''}</summary>
        <div class="sm-st-body">${body}</div>
    </details>`;
}

// ============================================================================
// CONDITIONS
// ============================================================================

function stageSelect(c, path, value, stageOptions, emptyLabel, extra = '') {
    const groups = stageOptions.map(g => `<optgroup label="${esc(`${g.arc.role === 'spine' ? 'Spine' : 'Thread'}: ${g.shape.name}`)}">
        ${g.stages.map(s => `<option value="${esc(s.key)}" ${s.key === value ? 'selected' : ''}>${esc(`${s.name} (${s.slot})`)}</option>`).join('')}
    </optgroup>`).join('');
    return `<select class="${c.select}" data-path="${esc(path)}" data-kind="opt" ${extra}><option value="">${esc(emptyLabel)}</option>${groups}</select>`;
}

function chapterSelect(c, path, value, chapterCount, emptyLabel, extra = '') {
    const opts = Array.from({ length: chapterCount }, (_, i) => `<option value="${i}" ${value === i ? 'selected' : ''}>Chapter ${i + 1}</option>`).join('');
    return `<select class="${c.select}" data-path="${esc(path)}" data-kind="int" ${extra}><option value="">${esc(emptyLabel)}</option>${opts}</select>`;
}

/**
 * A condition editor: tags (all / any / none), arc stage reached, chapter.
 * @param {Object} c - classes
 * @param {string} prefix - Path of the condition object
 * @param {Object} cond
 * @param {Object} ctx - { stageOptions, chapterCount }
 */
export function conditionEditor(c, prefix, cond = {}, ctx, labels = {}) {
    const csv = (key, label, hint) => field(c, label,
        `<input type="text" class="${c.input}" data-path="${esc(`${prefix}.${key}`)}" data-kind="csv" data-cond="${esc(prefix)}" value="${esc((cond[key] || []).join(', '))}" placeholder="tag_one, tag_two">`, hint);
    return `<div class="sm-st-condition">
        ${csv('tags_all', labels.all || 'All of these tags')}
        ${csv('tags_any', labels.any || 'Any of these tags')}
        ${csv('tags_none', labels.none || 'None of these tags')}
        <div class="sm-st-grid2">
            ${field(c, labels.stage || 'Arc stage reached', stageSelect(c, `${prefix}.stage`, cond.stage, ctx.stageOptions, 'Any', `data-cond="${esc(prefix)}"`))}
            ${field(c, labels.chapter || 'From chapter', chapterSelect(c, `${prefix}.chapter_min`, cond.chapter_min, ctx.chapterCount, 'Any', `data-cond="${esc(prefix)}"`))}
        </div>
    </div>`;
}

// ============================================================================
// SECTIONS
// ============================================================================

function arcsSection(bp, c, open) {
    const arcs = getEditableArcs(bp);
    const shapes = listShapes();
    const cards = arcs.map((arc, i) => {
        const def = getStageOptions(bp).find(g => g.arc.id === arc.id);
        const shapeOptions = shapes.map(s => `<option value="${s.id}" ${s.id === arc.shape ? 'selected' : ''} title="${esc(s.summary)}">${esc(s.name)}</option>`).join('');
        const notes = (def?.stages || []).map(s =>
            field(c, `${s.name} (${s.slot})`, textArea(c, `arcs.${i}.stage_notes.${s.id}`, arc.stage_notes?.[s.id] || '', 2, 'text', 'How this stage plays out in this story'))).join('');
        return `<div class="sm-st-card">
            <div class="sm-st-row">
                <strong>${arc.role === 'spine' ? 'Spine' : 'Thread'}</strong>
                <select class="${c.select}" data-action="arc-shape" data-index="${i}">${shapeOptions}</select>
                ${arc.role === 'thread' ? button(c, 'remove-thread', '<i class="fa-solid fa-trash"></i>', `data-index="${i}" title="Remove this thread"`, c.danger) : ''}
            </div>
            ${field(c, 'Question', textInput(c, `arcs.${i}.question`, arc.question || '', 'The open question this arc asks'))}
            <details class="sm-st-sub"><summary>Stage notes</summary>${notes}</details>
        </div>`;
    }).join('');
    const canAdd = arcs.filter(a => a.role === 'thread').length < MAX_THREADS;
    const intro = `<p class="sm-st-hint">The spine carries the main question and decides the ending. Up to ${MAX_THREADS} threads run alongside it. Changing a shape clears its stage notes and any chapter, tentpole or condition that pointed at its stages.</p>`;
    return section('arcs', 'fa-diagram-project', 'Story Arcs', intro + cards + (canAdd ? button(c, 'add-thread', '<i class="fa-solid fa-plus"></i> Add thread') : ''), open,
        `${arcs.length} arc${arcs.length === 1 ? '' : 's'}`);
}

function chaptersSection(bp, c, open) {
    const scenes = bp.scene_plan || [];
    if (!hasChapters(bp)) {
        const body = `<p class="sm-st-hint">This blueprint has no chapters, so each scene plays as its own chapter with arc stages taken from its phase. Create chapters to group scenes and choose which arc stages each chapter advances.</p>
            ${button(c, 'create-chapters', '<i class="fa-solid fa-layer-group"></i> Create chapters')}`;
        return section('chapters', 'fa-book-open', 'Chapters', body, open, 'one per scene');
    }
    const chapters = getChapters(bp);
    const stageOptions = getStageOptions(bp);
    const cards = chapters.map(ch => {
        const advances = new Set(ch.advances.map(r => `${r.arc}:${r.stage}`));
        const stageBoxes = stageOptions.map(g => `<div class="sm-st-stagegroup"><span class="sm-st-label">${esc(g.arc.role === 'spine' ? 'Spine' : 'Thread')}: ${esc(g.shape.name)}</span>
            ${g.stages.map(s => `<label class="sm-st-check"><input type="checkbox" data-action="advance" data-chapter="${ch.index}" data-key="${esc(s.key)}" ${advances.has(s.key) ? 'checked' : ''}> ${esc(s.name)}</label>`).join('')}
        </div>`).join('');
        const sceneNames = ch.scenes.map(i => `${i + 1}. ${esc(scenes[i]?.title || 'Untitled')}`).join(' · ') || '<em>No scenes</em>';
        return `<div class="sm-st-card">
            <div class="sm-st-row">
                <strong>Chapter ${ch.index + 1}</strong>
                ${button(c, 'chapter-up', '<i class="fa-solid fa-arrow-up"></i>', `data-index="${ch.index}" title="Move up"`)}
                ${button(c, 'chapter-down', '<i class="fa-solid fa-arrow-down"></i>', `data-index="${ch.index}" title="Move down"`)}
                ${chapters.length > 1 ? button(c, 'remove-chapter', '<i class="fa-solid fa-trash"></i>', `data-index="${ch.index}" title="Remove (its scenes join the previous chapter)"`, c.danger) : ''}
            </div>
            ${field(c, 'Title', textInput(c, `chapters.${ch.index}.title`, bp.chapters[ch.index]?.title || ''))}
            ${field(c, 'Summary', textInput(c, `chapters.${ch.index}.summary`, bp.chapters[ch.index]?.summary || '', 'One sentence: what this stretch is about'))}
            <div class="sm-st-field"><span class="sm-st-label">Advances</span>${stageBoxes}</div>
            <div class="sm-st-hint">Scenes: ${sceneNames}</div>
        </div>`;
    }).join('');
    const assign = scenes.map((s, i) => `<div class="sm-st-row sm-st-assign">
        <span>${i + 1}. ${esc(s.title || 'Untitled')}${s.is_ending_scene ? ' <em>(ending)</em>' : ''}</span>
        <select class="${c.select}" data-action="scene-chapter" data-scene="${i}">
            ${chapters.map(ch => `<option value="${ch.index}" ${ch.scenes.includes(i) ? 'selected' : ''}>Chapter ${ch.index + 1}</option>`).join('')}
        </select>
    </div>`).join('');
    const body = cards + button(c, 'add-chapter', '<i class="fa-solid fa-plus"></i> Add chapter')
        + `<details class="sm-st-sub" open><summary>Scenes in chapters</summary>${assign}</details>`;
    return section('chapters', 'fa-book-open', 'Chapters', body, open, `${chapters.length}`);
}

function checksBlock(bp, c) {
    const problems = checkStructure(bp);
    if (!problems.length) return '';
    const fixable = problems.some(p => p.startsWith('Arc rule'));
    return `<div class="sm-st-problems">
        <strong><i class="fa-solid fa-triangle-exclamation"></i> Structure check</strong>
        <ul>${problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
        ${fixable ? button(c, 'fix-arcs', '<i class="fa-solid fa-wand-magic-sparkles"></i> Apply arc rules') : ''}
    </div>`;
}

function tentpolesSection(bp, c, open, ctx) {
    const list = bp.tentpoles || [];
    const cards = list.map((t, i) => `<div class="sm-st-card">
        <div class="sm-st-row">
            ${textInput(c, `tentpoles.${i}.name`, t.name, 'Name')}
            ${button(c, 'remove-item', '<i class="fa-solid fa-trash"></i>', `data-list="tentpoles" data-index="${i}" title="Remove"`, c.danger)}
        </div>
        ${field(c, 'What happens regardless', textArea(c, `tentpoles.${i}.situation`, t.situation, 3, 'text', 'Events and other characters\' actions'))}
        <div class="sm-st-field"><span class="sm-st-label">Arrives when</span>${conditionEditor(c, `tentpoles.${i}.trigger`, t.trigger, ctx, { chapter: 'In chapter' })}</div>
        ${field(c, 'Ways the protagonist might meet it (one per line)', textArea(c, `tentpoles.${i}.ways_to_meet`, t.ways_to_meet || [], 3, 'lines'))}
        ${field(c, 'Setup hooks for earlier scenes (one per line)', textArea(c, `tentpoles.${i}.setup_hooks`, t.setup_hooks || [], 3, 'lines'))}
    </div>`).join('');
    const intro = '<p class="sm-st-hint">Situations that arrive whatever the player has done. The player decides how to meet them.</p>';
    return section('tentpoles', 'fa-car-burst', 'Tentpoles', intro + cards + button(c, 'add-tentpole', '<i class="fa-solid fa-plus"></i> Add tentpole'), open, `${list.length}`);
}

function complicationsSection(bp, c, open, ctx) {
    const list = bp.complications || [];
    const cards = list.map((x, i) => `<div class="sm-st-card">
        <div class="sm-st-row">
            ${textInput(c, `complications.${i}.name`, x.name, 'Name')}
            <label class="sm-st-check"><input type="checkbox" data-path="complications.${i}.once" data-kind="bool" ${x.once !== false ? 'checked' : ''}> Once</label>
            ${button(c, 'remove-item', '<i class="fa-solid fa-trash"></i>', `data-list="complications" data-index="${i}" title="Remove"`, c.danger)}
        </div>
        ${field(c, 'What happens', textArea(c, `complications.${i}.situation`, x.situation, 2))}
        <div class="sm-st-field"><span class="sm-st-label">Can be drawn when</span>${conditionEditor(c, `complications.${i}.when`, x.when, ctx)}</div>
    </div>`).join('');
    const intro = '<p class="sm-st-hint">Drawn when the story stalls. Among those whose conditions hold, the most specific one is chosen; leave a few with no conditions as general fallbacks.</p>';
    return section('complications', 'fa-bolt', 'Complications', intro + cards + button(c, 'add-complication', '<i class="fa-solid fa-plus"></i> Add complication'), open, `${list.length}`);
}

function endingsSection(bp, c, open, ctx) {
    const endings = listEndings(bp);
    const cards = endings.map((e, i) => {
        const path = i === 0 ? 'primary_ending' : `alternate_endings.${i - 1}`;
        return `<div class="sm-st-card">
            <div class="sm-st-row"><strong>${i === 0 ? 'Primary' : `Alternate ${i}`}: ${esc(e.title || 'Untitled')}</strong></div>
            <div class="sm-st-field"><span class="sm-st-label">Reached if</span>${conditionEditor(c, `${path}.reached_if`, e.reached_if, ctx)}</div>
        </div>`;
    }).join('');
    const intro = '<p class="sm-st-hint">From the climax on, the story leans toward the ending whose conditions best match the ledger. The primary ending is the fallback and wins ties. Edit ending text on the Details tab.</p>';
    return section('endings', 'fa-flag-checkered', 'Ending Conditions', intro + cards, open);
}

function choicesSection(bp, c, open) {
    const rows = (bp.scene_plan || []).map((s, si) => (s.choice_points || []).map((cp, ci) => `<div class="sm-st-card">
        <div class="sm-st-hint">Scene ${si + 1}: ${esc(s.title || 'Untitled')}</div>
        <div>${esc(cp.description || cp.id || 'Choice')}</div>
        ${field(c, 'Tags (one per approach)', `<input type="text" class="${c.input}" data-path="scene_plan.${si}.choice_points.${ci}.tags" data-kind="csv" value="${esc((cp.tags || []).join(', '))}" placeholder="sided_with_dispatcher, betrayed_dispatcher">`)}
    </div>`).join('')).join('');
    const untagged = countUntaggedChoices(bp);
    const intro = `<p class="sm-st-hint">Tags are how the story remembers a choice: the tracker records them in the ledger, and complications and endings check them.${untagged ? ` ${untagged} choice${untagged === 1 ? ' has' : 's have'} no tags.` : ''}</p>`;
    return section('choices', 'fa-code-branch', 'Choice Tags', intro + (rows || '<p><em>No choice points in this blueprint.</em></p>'), open, untagged ? `${untagged} untagged` : '');
}

/**
 * The whole editor.
 * @param {Object} bp - Blueprint
 * @param {Object} c - classes
 * @param {Object} openState - { sectionId: boolean }
 * @returns {string}
 */
export function renderStructureHtml(bp, c, openState = {}) {
    const ctx = { stageOptions: getStageOptions(bp), chapterCount: getChapters(bp).length };
    const isOpen = (id, dflt) => (openState[id] ?? dflt);
    const vocab = getVocabulary(bp);
    return `${checksBlock(bp, c)}
        ${arcsSection(bp, c, isOpen('arcs', true))}
        ${chaptersSection(bp, c, isOpen('chapters', false))}
        ${tentpolesSection(bp, c, isOpen('tentpoles', false), ctx)}
        ${complicationsSection(bp, c, isOpen('complications', false), ctx)}
        ${endingsSection(bp, c, isOpen('endings', false), ctx)}
        ${choicesSection(bp, c, isOpen('choices', false))}
        ${vocab.length ? `<p class="sm-st-hint sm-st-vocab"><strong>Tags in use:</strong> ${vocab.map(esc).join(', ')}</p>` : ''}`;
}
