# Changelog

All notable changes to Story Mode will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Signal markers (`@@BEAT:N@@`, `@@NEXT_SCENE@@`, ...) are now stripped through the host's own message renderer, so the message keeps its markdown formatting (it was previously replaced with raw text), and the active swipe is cleaned too
- Signal parsing tolerates common model formatting drift (`@@ BEAT: 2 @@`, `@@NEXT SCENE@@`, markers wrapped in backticks or bold)
- Auto-generated "What's Next" options at arc completion were saved under a malformed key and never appeared in Arc History; the empty-result check was also skipped
- GLM 4.7 reasoning retry never sent `reasoning.effort` (the override payload was dropped); retry detection no longer fires on every HTTP 400
- Lorebook context is now forwarded to blueprint generation when it is passed on the request
- The v2 IndexedDB to File API blueprint library migration was never invoked; it now runs once at startup
- Hard-coded `third-party/Extension-StoryMode/` paths replaced with the extension's real base URL, so the extension works under any install folder name (including SillyBunny per-user extension folders)

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
