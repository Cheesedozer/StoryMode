# Changelog

All notable changes to Story Mode will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added (editor support)
- **Structure tab** in both the extension's blueprint editor and the standalone editor: story arcs (shapes, questions, stage notes), chapters (titles, summaries, the stages each advances, which scenes they hold), tentpoles, complications, ending conditions and choice tags, with a structure check that flags thread climaxes out of order and fixes them
- Saved blueprints record `schema_version: 2`
- **Ledger compaction:** when a chapter ends, its ledger entries fold into one summary that keeps every tag; unfold it in the ledger editor to restore them (Story Tracking settings: Fold Finished Chapters)

### Changed
- Swiping or regenerating a reply no longer counts toward the stall that brings in a complication
- Scene summarization reuses the shared reasoning-retry request instead of its own copy

### Added (chapters and drama manager)
- **Chapters:** generated blueprints group scenes into chapters, and chapters say which arc stages they advance. The arc blending rules now apply per chapter. Older blueprints play as one chapter per scene
- **Tentpoles:** 2–4 situations per blueprint that arrive at a set chapter or arc stage whatever the player has done; the player decides how to meet them. The story type's memorable element becomes one of them
- **Complications:** a pool of 6–10 per blueprint. After several replies without progress (default 4, configurable, can be turned off), the most specific complication whose conditions match what has happened is brought in
- **Conditional endings:** each ending has conditions on what the player did. From the climax on, the story leans toward the best match; the resolution, the final scene and the epilogue follow it
- Choice points carry tags; the narrator's `@@NOTE: ...@@` marker and the secondary tracker record them; tags are visible and editable in the ledger editor
- The epilogue receives the ledger and the ending the story leaned toward
- Controller panel shows the chapter and anything happening now

### Fixed
- Reading chat state replaced the play-state object every time, so code that held it across another read could lose its changes
- The single-call scene prompt's JSON example had a stray quote

### Added (story arc shapes)
- **13 arc shapes:** Escalation, Mystery, Tournament, Siege, Journey, Journey and return, Heist, Episodic, Kishōtenketsu, Tragedy, Quiet or cumulative, Romance and Comedy of errors. Each has its own stages mapped onto the four pacing phases
- **Spine and threads:** a story has one main arc and up to two threads (a romance inside a heist, a mystery inside a siege). Generated blueprints keep thread climaxes before or together with the main climax, and at most one thread peaks per scene
- Story Mode: Story Shape and Threads pickers in Genre & Style; the narrator gets the current stage of each arc instead of generic phase goals
- Blueprint generation: Story Shape and Threads on the generate form; Phase 1 writes each arc's question and how each stage plays out; scenes record the arc stages they advance; Scenario Mode injects `<arcs>`
- Story types gain a default shape and suggested threads (editable in the story type editor, produced by the story type generator)

### Changed (arc shapes)
- Quiet and kishōtenketsu stories build to a moment of resonance or a turn, never a confrontation, in Story Mode and in generated blueprints
- A story type's phase prompts are only used when the story keeps that type's default shape
- Blueprints without arcs play as an Escalation spine that follows their scene phases

### Added (story tracking and ledger)
- **Story ledger:** a record of the player's choices, promises, secrets, relationship shifts, items and world changes, sent to the narrator every turn as `<what_is_true_now>` so earlier choices keep shaping the story. Entries follow swipes: swiping or deleting a reply retires what it recorded. Hidden by default; turn on "Show Story Ledger" to see it in the controller panel and add, edit or delete entries (edited entries are kept regardless of swipes)
- **Secondary-model tracker:** beat tracking, scene advancement and the ledger can run on a separate, cheaper connection profile after every reply instead of inline markers. The next generation waits for it (configurable timeout); if a call fails, the next reply falls back to inline markers
- Inline `@@NOTE: ...@@` marker lets the narrating model add ledger entries
- Settings → Scenario Blueprint Settings → Story Tracking & Ledger

### Changed (state)
- One play state per chat (`chat_metadata.story_mode.scenario`): scene index, beat statuses, ledger and tracker fallback. The duplicate `blueprintState.currentSceneIndex` and `beatProgress` copies are migrated on load and no longer written, which removes the scene-index drift and beat-state duplication

### Fixed
- Signal markers (`@@BEAT:N@@`, `@@NEXT_SCENE@@`, ...) are now stripped through the host's own message renderer, so the message keeps its markdown formatting (it was previously replaced with raw text), and the active swipe is cleaned too
- Signal parsing tolerates common model formatting drift (`@@ BEAT: 2 @@`, `@@NEXT SCENE@@`, markers wrapped in backticks or bold)
- Auto-generated "What's Next" options at arc completion were saved under a malformed key and never appeared in Arc History; the empty-result check was also skipped
- GLM 4.7 reasoning retry never sent `reasoning.effort` (the override payload was dropped); retry detection no longer fires on every HTTP 400
- Lorebook context is now forwarded to blueprint generation when it is passed on the request
- The v2 IndexedDB to File API blueprint library migration was never invoked; it now runs once at startup
- Hard-coded `third-party/Extension-StoryMode/` paths replaced with the extension's real base URL, so the extension works under any install folder name (including SillyBunny per-user extension folders)

### Changed (decisions)
- Core premises may run 1–5 sentences, so the goal–motivation–conflict test doesn't force a cramped slogan
- POV removed from story types; the writing style decides point of view
- A blueprint's violence/romance levels now describe the story's intended intensity within the Mature Content setting (generated in Phase 1; injected as `intended_intensity`); Mature Content "Off" adds no guidance
- All 43 memorable elements rewritten as unavoidable situations the player can steer but not prevent; generation prompts and the story-type editor describe them that way

### Added (standalone editor)
- **The Fullscreen Editor is finished and re-enabled.** It shares the extension's library code through an import map and small shims, so blueprints it saves are byte-compatible with the extension's
- AI generation, cover generation, personas and characters run through the open SillyTavern tab over a BroadcastChannel bridge (`lib/bridge/standalone-host.js`), using your real connection profiles and image source
- Save to Library (Ctrl+S) with unsaved-change tracking; library changes in either tab refresh the other
- Details tab rewritten to edit the real blueprint fields (title, story type, writing style, premise, setting, protagonists, opposition, arc structure, tone, content, opening message, endings) with write-through
- Scenes and Characters tabs rewritten for the real scene/arc schema (goal, situation, beats, turning points); edits merge into existing records so unseen fields survive; scenes can be reordered
- Wizard: pick your persona (the protagonist) and existing characters, scene count and genre interpretation; live progress from the SillyTavern tab
- Library card export, help dialog, connection status panel; libraries are served by SillyTavern instead of CDNs

### Fixed (standalone editor)
- Saving wrote JSON into `.png` library files and a manifest with a string version, which the extension would have treated as invalid and replaced with an empty library; the extension now also repairs such manifests instead of discarding them
- Wizard steps wiped earlier steps' answers; the success path never resolved because jQuery `.remove()` cleared the stored callback
- Tabs never switched (wrong container selector); added items didn't appear until switching tabs; the lorebook tab's buttons were unbound
- Covers were stored in fields the codec ignores; the Details tab never wrote changes back
- Unescaped user text in wizard HTML

### Changed (story structure, styles, content)
- **Four phases everywhere**: Story Mode rounds and blueprint scenes now share setup / escalation / climax / resolution (25/50/15/10%) from `lib/core/phases.js`. Legacy three-phase story types and blueprints are mapped automatically
- All 43 built-in story types: phase guidance rewritten for four phases around goal, motivation and conflict, with outcomes left to the player (no more "justice is served" / "love triumphs"); trope lists removed; the most cliché taglines rewritten
- **Writing styles describe technique instead of naming the author**: the "Write in a style inspired by X" line is gone from all 42 built-in styles and from every generation prompt; names remain as menu labels
- **Mature Content setting (Off / Intimacy / Explicit)** replaces the NSFW toggle (on migrates to Explicit). Each style's `nsfwPrompt` was rewritten to describe how its voice writes intimacy rather than forbidding it; guidance also reaches blueprint generation, and states that sexual content involves adults only
- Generation prompts: removed the copied worked examples (every prompt used the same memory-archive story), removed CRITICAL / MUST / non-negotiable emphasis, made the premise follow the goal-motivation-conflict test, made scene purposes goals and `key_events_if_unchallenged` "what the opposition does if the protagonist doesn't intervene", and made endings conditional on the player's choices
- Metaphor-level instructions no longer contradict themselves or impose Monster-of-the-Week structure on every genre
- Scene summaries now record the protagonist's choices and their consequences

### Fixed
- Normalization dropped `key_events_if_unchallenged` (it wrote a misspelled `key_events_if_unchanged`), so the field never reached the controller panel
- The blueprint schema only accepted the old three phase names although generation produced four
- `renderTemplate` hung forever if a value contained its own placeholder, and expanded `$&`-style patterns in user text
- Blueprints without content boundaries injected `violence="None specified" romance="None specified"`

### Removed
- The Master Prompt editor and `data/blueprint-master-prompt.txt`: generation never used them, and edits were never saved
- The stale `prompts/utilities/generated/` sample

### Changed (prompts)
- Scenario Mode injection: new `<role>` block keeping the model's hands off `{{user}}`'s actions, words and feelings; protagonists' goal now injected; choice points framed as decisions for `{{user}}` rather than a menu of options
- Beats are marked only once they have fully played out (was: "after addressing this beat"), to stop the model racing through one beat per reply
- `@@STORY_COMPLETE@@` instructions now appear only in the final scene (they were also shown in the penultimate scene, contradicting `@@NEXT_SCENE@@`)
- Exit-trigger derivation no longer mangles "Establishes…"/"Revealing…" purposes
- Story Mode phase goals rewritten around goal, motivation and conflict; removed "Save escalation for later phases"
- Epilogue, summary and What's Next transcripts now include speaker names; What's Next no longer forces a playful tone
- Blueprint generation: removed "do not engage in internal reasoning" from every phase prompt, corrected "Phase N of 5" to 4, and the player persona's turning points and beats now describe situations, leaving decisions and reactions to the player
- Opening message: no longer given the climax and ending; leaves the player's character to the player and ends on a concrete story beat

### Removed (prompts)
- Unused `validation-prompt.txt` and `characters-prompt.txt`

### Removed
- ~2,500 lines of dead code: unreachable modules, unused exports and imports, the unreachable Story Mode branch of the blueprint injection builder, and the unused default-export object in `lib/blueprint/module.js`

## [1.1.0] - 2025-01-28

### Added
- **Overview Tab**: New landing page in settings dialog with quick mode switching and status summary
- **Per-Phase API Profiles**: Wizard now supports selecting different API presets for each generation phase (Foundation, Characters, Scenes, Resolutions)
- **Smart Character Injection**: Automatically injects character data for scene-focused characters even when they're not in the current chat roster
- **Author Style Overrides**: Character-specific and group-specific author style settings with global default fallback
- **Current Scenario Tab**: Quick view and edit interface for active scenarios without opening full editor
- **JSON Export**: Export blueprints with full metadata for backup or sharing
- **Character Picker Component**: Dedicated UI component for character selection in blueprints
- **Real-Time Wizard Logging**: Generation wizard displays live status updates during LLM operations
- **Import Deduplication**: Improved import flow with duplicate detection and conflict resolution

### Changed
- **Settings Organization**: Separated Story Mode and Scenario Mode controls into distinct sections for clarity
- **Unsaved Changes Indicator**: Now properly scoped to editor tabs only (no longer shows on unrelated UI elements)
- **Library Auto-Import**: Embedded resources (covers, character data) now automatically imported when loading scenarios
- **Modal Behavior**: Improved dialog closing and edit discarding on load

### Fixed
- **Cover Image Persistence**: Resolved blob URL issues causing covers to disappear after reload
- **Round Display**: Corrected UI to show actual rounds instead of scene count in all locations
- **Beat Validation**: Now correctly accepts all 13 beat types during validation
- **Modal Closing**: Fixed blueprint editor modal closing behavior and proper discard of unsaved edits
- **Nested Field Loss**: Prevented loss of nested blueprint fields when editing multiple sections
- **Wizard Token Doubling**: Generalized retry token doubling logic for all generation phases (not just phase 1)
- **Beat Type Migration**: Added migration to convert disallowed beat types to core types
- **SD Initialization**: Fixed Stable Diffusion init bug for cover generation

### Technical
- New modules: `lib/scenario/character-injection.js`, `lib/ui/components/character-picker.js`, `lib/ui/components/phase-override-panel.js`, `lib/utils/import-helpers.js`
- Enhanced security: Added prototype pollution prevention in import helpers
- Improved code organization with extracted helper functions

---

## [1.0.0] - 2025-01-22

### Added

**Core Features**
- 43 pre-defined story types across Mystery, Horror, Fantasy, Sci-Fi, Romance, Action, Drama, and more
- Author style emulation system with optional NSFW/mature content guidance
- Three-phase narrative arc structure (Setup → Escalation → Resolution)
- Configurable arc length (5-150 rounds)

**Scenario Blueprints**
- LLM-generated narrative plans with multi-scene progression
- Beat-level tracking within scenes using signal markers (`@@BEAT:N@@`, `@@NEXT_SCENE@@`)
- Phased wizard for blueprint generation (Foundation → Characters → Scenes → Resolutions)
- Opening message generation per blueprint
- Cover art generation via Stable Diffusion integrations

**Scenario Library**
- File-backed storage using SillyTavern's file API (cross-browser compatible)
- PNG steganography for blueprint storage (metadata embedded in images)
- Import/export blueprints as shareable PNG files
- Folder organization (All, Favorites, Recently Played)
- Search and sort capabilities

**Editor & Customization**
- Full CRUD editor for story types and author styles
- Blueprint editor with tabbed interface (Details, Scenes, Cover, Characters)
- Cover gallery with multi-image support
- Scene reordering via drag-and-drop

**Post-Arc Features**
- Automatic epilogue generation when arc completes
- Chat summarization on demand or at arc completion

**UI/UX**
- Wand menu for quick access to controls
- Story controller panel (floating or docked)
- Live prompt preview showing injected context
- Integration with SillyTavern's theming system

**API & Integration**
- Configurable API profiles for different generation tasks
- Injection position/depth/role settings
- Debug mode for troubleshooting prompt injection

### Technical Notes

- Modular architecture with separated concerns (core, blueprint, dialog, editor, UI)
- Event-driven state management with chat metadata persistence
- Dual pacing modes: round-based (Story Mode) and signal-based (Scenario Mode)
- File-backed storage replaces IndexedDB for better cross-browser compatibility

---

## [0.0.1] - Development

Initial development version. Not for production use.
