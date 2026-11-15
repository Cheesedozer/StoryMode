/**
 * Story events in blueprint data: tentpoles, complications and conditional
 * endings. Normalization only; the runtime lives in story/drama.js.
 *
 *   tentpoles:     [{ id, name, trigger: { chapter? | stage? | ...condition }, situation, ways_to_meet[], setup_hooks[] }]
 *   complications: [{ id, name, when: condition, situation, once }]
 *   primary_ending / alternate_endings[]: { id, title, description, reached_if: condition, ... }
 *
 * This module has no SillyTavern imports.
 *
 * @module story/story-events
 */

import { normalizeCondition, toTag } from './conditions.js';
import { resolveStageKey, getChapters } from './chapters.js';
import { normalizePhase } from '../core/phases.js';

const text = v => String(v ?? '').trim();
const textList = v => (Array.isArray(v) ? v : []).map(text).filter(Boolean);

function uniqueId(base, used, fallback) {
    let id = toTag(base) || fallback;
    while (used.has(id)) id = `${id}_2`;
    used.add(id);
    return id;
}

/**
 * Clean tentpoles in place. A trigger needs a chapter, a stage or a condition;
 * tentpoles without a usable trigger or situation are dropped.
 * @param {Object} blueprint
 */
export function normalizeTentpoles(blueprint) {
    if (!Array.isArray(blueprint?.tentpoles)) {
        if (blueprint) delete blueprint.tentpoles;
        return;
    }
    const resolve = ref => resolveStageKey(blueprint, ref);
    const used = new Set();
    blueprint.tentpoles = blueprint.tentpoles.map((t, i) => {
        const situation = text(t?.situation || t?.description);
        if (!situation) return null;
        const trigger = normalizeCondition(t.trigger || {}, resolve);
        if (!Object.keys(trigger).length) return null;
        return {
            id: uniqueId(t.id || t.name, used, `tentpole_${i + 1}`),
            name: text(t.name) || `Tentpole ${i + 1}`,
            trigger,
            situation,
            ways_to_meet: textList(t.ways_to_meet),
            setup_hooks: textList(t.setup_hooks),
        };
    }).filter(Boolean);
}

/**
 * Clean complications in place.
 * @param {Object} blueprint
 */
export function normalizeComplications(blueprint) {
    if (!Array.isArray(blueprint?.complications)) {
        if (blueprint) delete blueprint.complications;
        return;
    }
    const resolve = ref => resolveStageKey(blueprint, ref);
    const used = new Set();
    blueprint.complications = blueprint.complications.map((c, i) => {
        const situation = text(c?.situation || c?.description);
        if (!situation) return null;
        return {
            id: uniqueId(c.id || c.name, used, `complication_${i + 1}`),
            name: text(c.name) || `Complication ${i + 1}`,
            when: normalizeCondition(c.when || {}, resolve),
            situation,
            once: c.once !== false,
        };
    }).filter(Boolean);
}

/**
 * Give every ending an id and a normalized reached_if (possibly empty).
 * @param {Object} blueprint
 */
export function normalizeEndingConditions(blueprint) {
    if (!blueprint) return;
    const used = new Set();
    if (blueprint.primary_ending && typeof blueprint.primary_ending === 'object') {
        const e = blueprint.primary_ending;
        e.id = uniqueId(e.id || 'primary', used, 'primary');
        e.reached_if = normalizeCondition(e.reached_if || {});
    }
    (Array.isArray(blueprint.alternate_endings) ? blueprint.alternate_endings : []).forEach((e, i) => {
        if (!e || typeof e !== 'object') return;
        e.id = uniqueId(e.id || e.title, used, `alternate_${i + 1}`);
        e.reached_if = normalizeCondition(e.reached_if || {});
    });
}

/**
 * Older blueprints: the story type's memorable element becomes a tentpole,
 * but only where a scene already references it (by name), triggering in that
 * scene's chapter. Otherwise nothing is added, so a story that never set the
 * moment up is not interrupted by it.
 * @param {Object} blueprint
 */
export function migrateMemorableElement(blueprint) {
    if (Array.isArray(blueprint?.tentpoles) && blueprint.tentpoles.length) return;
    const me = blueprint?.story_type_memorable_element;
    if (!me?.name || !me?.description) return;
    const needle = me.name.toLowerCase();
    const scenes = blueprint.scene_plan || [];
    const sceneIndex = scenes.findIndex(s => JSON.stringify(s || {}).toLowerCase().includes(needle));
    if (sceneIndex < 0) return;
    const chapters = getChapters(blueprint);
    const chapter = chapters.findIndex(c => c.scenes.includes(sceneIndex));
    blueprint.tentpoles = [{
        id: toTag(me.name) || 'memorable_element',
        name: me.name,
        trigger: { chapter_min: Math.max(0, chapter) },
        situation: me.description,
        ways_to_meet: [],
        setup_hooks: textList(me.setup_hooks),
        migrated: true,
    }];
}

/** Every ending in order, primary first, with ids. */
export function listEndings(blueprint) {
    return [blueprint?.primary_ending, ...(blueprint?.alternate_endings || [])].filter(e => e && typeof e === 'object');
}

/** Whether a scene is in the climax or resolution slot. */
export function isLateScene(scene) {
    const phase = normalizePhase(scene?.phase, 'setup');
    return phase === 'climax' || phase === 'resolution';
}
