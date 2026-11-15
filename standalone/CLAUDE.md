# Story Mode Standalone Editor - Development Guide

Quick reference for developing the standalone blueprint editor.

## Overview

The standalone editor is a full-page blueprint editor that SillyTavern serves from the extension folder (Story Mode → Fullscreen Editor). It shares the extension's library and code:

- **Storage**: it imports the extension's own storage modules (`lib/blueprint/library-adapter.js`, `file-storage.js`, `manifest.js`, `codec.js`) so the manifest and blueprint PNGs are written in exactly the extension's format. Their SillyTavern imports (`/script.js`, `/scripts/popup.js`) are redirected to `shims/` by the import map in `index.html`.
- **Generation and SillyTavern state**: AI generation, cover generation, characters, personas and the user's story types/styles come from an open SillyTavern tab over a same-origin BroadcastChannel (`adapters/host-bridge.js` ↔ `lib/bridge/standalone-host.js`). Generation therefore uses the user's real connection profiles and image source.
- **Cross-tab consistency**: every library write is announced on the bridge; the other side reloads its cached manifest instead of overwriting the change.

## Architecture

### Directory Structure

```
standalone/
├── index.html                    # Entry point, import map, ST-served libraries
├── app.js                        # Main orchestrator, event wiring
├── settings-system.js            # Settings + theme management
│
├── shims/                        # Import-map targets for lib/ modules
│   ├── script.js                 # getRequestHeaders, eventSource
│   └── popup.js                  # callGenericPopup, POPUP_TYPE
│
├── adapters/                     # ST dependency bridges
│   ├── host-bridge.js            # BroadcastChannel client to the ST tab
│   ├── popup-adapter.js          # Modal system (replaces ST Popup)
│   ├── connection-bridge.js      # CSRF, style lists, generation entry points
│   ├── notification-adapter.js   # Toast messages (wraps toastr)
│   ├── character-adapter.js      # Read-only character access
│   └── library-storage-adapter.js # Blueprint library file API wrapper
│
├── ui/                           # UI components
│   ├── routing.js                # Tab navigation
│   ├── connection.js             # Connection status UI
│   ├── modals.js                 # Settings modal management
│   └── library-view.js           # Blueprint library grid UI
│
├── form/
│   └── collapsible.js            # Collapsible sections
│
├── editors/                      # Tab-specific editors (real blueprint schema)
│   ├── details-editor.js         # Top-level fields, write-through by path
│   ├── scenes-editor.js          # Scene CRUD, beats, reordering
│   ├── characters-editor.js      # Character arc CRUD
│   ├── structure-editor.js       # Structure tab: mounts lib/editor/structure
│   ├── cover-editor.js           # Cover tab UI
│   ├── cover-model.js            # metadata.coverGallery model (shared format)
│   └── form-fields.js            # Modal form builder/reader
│
├── handlers/                     # Action handlers
│   └── blueprint-actions.js      # Blueprint CRUD operations
│
├── wizards/                      # Multi-step workflows
│   └── blueprint-wizard.js       # Blueprint generation wizard
│
└── themes/                       # Self-contained theming
    ├── base.css                  # CSS variables + fallbacks
    ├── dark.css                  # Dark theme
    ├── light.css                 # Light theme + fixes
    ├── rpg-companion.css         # RPG theme
    ├── app.css                   # App layout styles
    ├── components.css            # Form/editor styles
    ├── form.css                  # Form-specific styles
    ├── layout.css                # Layout utilities
    ├── wizard.css                # Wizard styles
    └── library.css               # Library grid styles
```

### Adapter Pattern

The standalone editor uses adapters to bridge SillyTavern dependencies:

| ST Dependency | Adapter | Behavior in Standalone |
|--------------|---------|------------------------|
| `Popup` class | `popup-adapter.js` | Creates DOM-based modals, `okButton: false` for custom actions |
| `extension_settings` | `settings-system.js` | Uses localStorage, separate namespace |
| `characters` array | `character-adapter.js` | Returns empty array unless connected |
| `toastr` | `notification-adapter.js` | Wraps toastr.js directly |
| Library operations | `library-storage-adapter.js` | File API wrapper for blueprint manifest and PNG storage |

### Module Reuse Strategy

**Reuse directly from `lib/` (ST-free modules):**
- `lib/blueprint/schema.js` - Field definitions, validation, dropdown options
- `lib/blueprint/utils.js` - Utility functions (escapeHtml, getNestedValue, etc.)
- `lib/blueprint/validation.js` - Blueprint validation
- `lib/blueprint/file-storage.js` - Two-phase commit pattern

**Adapt from `lib/editor/blueprint-editor/`:**
- `state.js` - Can be imported directly (no ST dependencies)
- `details-tab.js` - Pass storyTypes/authorStyles as parameters
- `scenes-tab.js` - Adapt modal creation to use popup-adapter
- `cover-tab.js` - Adapt gallery handling

## Import Patterns

### Reusing from lib/

```javascript
// ✅ CORRECT - Import from parent lib/ directory
import { BLUEPRINT_FIELDS, DROPDOWN_OPTIONS } from '../../lib/blueprint/schema.js';
import { escapeHtml, getNestedValue } from '../../lib/blueprint/utils.js';
import { validateBlueprint } from '../../lib/blueprint/validation.js';
```

### Avoiding Duplication

```javascript
// ❌ WRONG - Don't duplicate code
export const DROPDOWN_OPTIONS = { /* duplicate */ };

// ✅ CORRECT - Reuse from lib/
export { DROPDOWN_OPTIONS } from '../../lib/blueprint/schema.js';
```

## Theme System

### Applying Themes

```javascript
import { applyTheme, getCurrentTheme } from './settings-system.js';

// Apply theme (sets CSS variables on document)
applyTheme('dark');

// Get current theme
const theme = getCurrentTheme();
```

### Theme Definition Pattern

Each theme includes:
- Complete CSS variable fallbacks (no dependency on ST variables)
- `disableBackdropFilter` for light theme (separate context fix)
- `disableTextShadow` for light theme (readability fix)

```javascript
const THEMES = {
    light: {
        name: 'Light',
        cssClass: 'theme-light',
        variables: { /* complete fallbacks */ },
        disableBackdropFilter: true,   // Critical for separate context
        disableTextShadow: true,       // Critical for readability
    }
};
```

## Connections

| Needs | Provided by | Without it |
|-------|-------------|-----------|
| Library load/save/import | SillyTavern server (CSRF + `/api/files/*`) | Editing and PNG export still work; nothing is saved |
| AI generation, covers, personas | An open SillyTavern tab with Story Mode | Wizard and Generate Cover explain that a tab is needed |
| Characters | ST tab, else `POST /api/characters/all` | Empty list |
| Story types / styles | ST tab, else `user/files/storymode-*.json`, else bundled defaults | Bundled defaults |

## File Size Limits

Per project guidelines, no file should exceed 400 lines. Split large files:

```javascript
// ❌ WRONG - 600+ lines
export function renderDetailsTab() { /* huge function */ }

// ✅ CORRECT - Split into focused modules
// editors/scenes-editor.js (tab + CRUD)
// editors/form-fields.js (shared modal form helper)
```

## Testing Checklist

- [ ] Opens from Story Mode → Fullscreen Editor with no console errors
- [ ] Banner shows "AI generation available" while the SillyTavern tab is open, and the library-only message when it is closed
- [ ] Generate AI: persona preselected, characters listed, progress shown, result opens unsaved
- [ ] Details edits change the blueprint (unsaved dot appears); Save writes it; the SillyTavern library shows the change
- [ ] Scenes: add, edit (beats), reorder, delete; edited scenes keep fields not shown in the form
- [ ] Characters: add, edit, delete arcs
- [ ] Structure: edit arcs, chapters, tentpoles, complications, ending conditions, choice tags; Save keeps them
- [ ] Cover: upload, generate, select, delete; saved PNG keeps the chosen cover
- [ ] Import PNG (duplicate dialog), Export PNG, Export JSON, library card export
- [ ] Saving in SillyTavern refreshes the editor's library, and vice versa
