# Characters & Personas Architecture

Detailed reference for how characters and personas flow through blueprint generation, storage, export/import, and UI display. For quick reference see [CLAUDE.md](./CLAUDE.md). For system design see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Data Flow Overview

```
Wizard or standalone editor (personaData, character selection)
  → request.persona_data / character_data
  → LLM Prompts (PERSONA DATA section; the persona is the protagonist)
  → Generated Blueprint (personaData, character_arcs, scene_plan.character_focus)
  → Editor (characters-tab.js / standalone characters-editor.js)
  → Play (injection: <role>, character focus, ledger who_knows)
  → Export (embeddedResources.characters / .personas as PNG data URLs)
  → Import (import-ui.js dialog → linker.js upload → SillyTavern library)
```

## The Persona Is the Protagonist

The user's persona is always the protagonist, and the user decides what it says, does and feels. This shapes every stage:

- **Generation prompts** (Phases 1–4, `prompts/phased-generation/*`): the premise and opposition are built to put pressure on the persona. The persona gets a `character_arcs` entry like anyone else, but its turning points are written as *situations the story puts them in* ("is offered a deal that saves their sister but betrays the crew"), and its `final_state` lists two or three outcomes that depend on the player's choices. Beats that involve the persona set up a situation and leave the response to the player.
- **Injection** (`lib/scenario/injection.js`): a `<role>` block tells the narrator it plays the world and every character except `{{user}}`. Character arcs are injected with `arc_start` and `trajectory` only; `final_state` is never injected, so outcomes stay open.
- **Tentpoles and complications** are written as events and other characters' actions; how `{{user}}` meets them is open.
- **Ledger** (`lib/story/ledger.js`): entries record `who_knows`, and the narrator is told that information only reaches characters who know it. The tracker records the persona's choices as tagged entries, which drive complications and the ending lean.
- **Epilogue** (`lib/core/event-handlers.js`): receives the ledger and the ending the story leaned toward; `{{user}}` in that text is replaced with the persona's name (`name1`) because the request bypasses macro expansion.

## Blueprint Fields Referencing Characters & Personas

| Field | Type | Source | Purpose |
|-------|------|--------|---------|
| `character_arcs[]` | `{character_name, initial_state, key_turning_points, final_state, emotional_trajectory}` | LLM-generated | Primary character data; linker uses `character_name` to match library |
| `scene_plan[].character_focus[]` | `{name, emotional_beat_target, turning_point}` | LLM-generated | Per-scene character narrative instructions; injected into prompts |
| `personaData` | `{id, name}[]` | Generation (`addBlueprintMetadata` copies `request.persona_data`) | The personas the story was written for; read by export, status detection and import |
| `selectedPersonas` | `string[]` or `{id, name}[]` | Older blueprints only | Legacy name; every reader falls back to it (`selectedPersonas \|\| personaData`) |
| `primary_ending.character_outcomes[]`, `alternate_endings[].character_outcomes[]` | `{character_name, outcome}` | LLM-generated (Phase 4) | Where each character ends up in that ending; the ending scene's `character_focus` is built from the primary ending's |
| `chatState.scenario.ledger[].who_knows` | `string[]` | Tracker / narrator / player | Which characters know a recorded fact (runtime, per chat, not in the blueprint) |
| `embeddedResources.characters[]` | `{name, avatar, pngDataUrl, metadata}` | Export / PNG import | Full character card PNG as data URL |
| `embeddedResources.personas[]` | `{id, name, description, title, avatarDataUrl}` | Export / PNG import | Persona avatar + metadata |

### `personaData` and the legacy `selectedPersonas`

The wizard (`lib/dialog/wizard.js`, `getWizardFormData`) and the standalone editor (through `lib/bridge/standalone-host.js`) send persona selections as `request.persona_data: [{id, name}]`. Generation copies them onto the blueprint as `personaData` (`addBlueprintMetadata` in `lib/generation/orchestration.js`). Export (`lib/blueprint/export.js`), status detection (`scenario-characters.js`) and the editor's export action all read `selectedPersonas || personaData`, so blueprints that only have the older field keep working.

Before 1.5.0, generation never stored the selection, so exported PNGs left out the persona. Export now also embeds any `character_arcs` entry whose name matches one of the user's personas, which covers those older blueprints.

## Character Linking

**File:** `lib/blueprint/characters/linker.js` — `linkBlueprintCharacters(blueprint)`

```javascript
// Returns:
{
  linked: [{blueprintName, localCharacter}],      // Found in character library
  linkedPersonas: [{blueprintName, localPersona}], // Found in persona list
  missing: [name1, name2]                          // Not found anywhere
}
```

**Matching algorithm** (per `character_arcs` entry):
1. Search `getAllCharacters()` by normalized name → **linked**
2. Search `getAllPersonas()` by normalized name → **linkedPersona**
3. Neither → **missing**

**Character vs Persona distinction** is determined at link time, not stored in the blueprint. The same `character_arcs` array holds both; the linker classifies by library lookup.

## Status Detection (Scenario Characters Module)

**File:** `lib/ui/components/scenario-characters.js`

### `getBlueprintCharactersWithStatus(blueprint)`

Collects names from `character_arcs` and `scene_plan.character_focus`, **excluding known persona names** (from `embeddedResources.personas`, `selectedPersonas`, `personaData`).

For each name, checks:
1. `findCharacterByName()` → status: `'linked'`, avatar from library
2. Match in `embeddedResources.characters` → status: `'embedded'`, avatar from `pngDataUrl`
3. Neither → status: `'missing'`, no avatar

### `getBlueprintPersonasWithStatus(blueprint)`

Collects names from `selectedPersonas` OR `personaData` (handles both string and `{id, name}` formats), plus `embeddedResources.personas` names.

For each name, checks:
1. `findPersonaByName()` → status: `'linked'`, avatar from `/User Avatars/{id}`
2. Match in `embeddedResources.personas` → status: `'embedded'`, avatar from `avatarDataUrl`
3. Neither → status: `'missing'`, no avatar

### `getResourceSummaryCounts(blueprint)`

Returns `{characters: {total, embedded, linked, missing}, personas: {total, embedded, linked, missing}}` for controller panel display.

## Blueprint Editor (Characters Tab)

**File:** `lib/editor/blueprint-editor/characters-tab.js`

### Sub-tabs
- **Characters** — Picker grid + linked characters display
- **Character Arcs** — Arc cards with edit/delete

### Character Picker
- Shows all SillyTavern characters from `getAllCharacters()`
- Shows all personas from `getAllPersonas()`
- Click to add → creates skeleton `character_arcs` entry via `addCharacterArcFromPicker(name)`

### Linked Characters Display (`renderLinkedCharacters`)

Three sections rendered from `linkBlueprintCharacters()` output:

| Section | Card Function | Data Source |
|---------|--------------|-------------|
| Characters (in library) | `renderCharacterCard(localCharacter, true)` | `linkInfo.linked` |
| Personas | `renderPersonaCard(localPersona)` | `linkInfo.linkedPersonas` |
| Not in Library | `renderMissingCharacterCard(name, embeddedData)` | `linkInfo.missing` + `embeddedResources` lookup |

### State Management

```javascript
getCurrentBlueprint()        // In-memory blueprint object
setHasUnsavedChanges(true)   // Marks editor as dirty
// Save: the editor popup's Save validates and saves (saveBlueprint in lib/editor/blueprint-editor.js);
// "Load Story" loads it as the current scenario (saveBlueprintToState)
```

### Add/Remove Character Arc

```javascript
addCharacterArcFromPicker(name)  // Push skeleton arc, setHasUnsavedChanges(true)
deleteCharacterArc(index)        // Splice from character_arcs, setHasUnsavedChanges(true)
```

**Event handlers:** `lib/editor/blueprint-editor/character-handlers.js` — document-level delegation with `EVENT_NAMESPACE` to prevent stacking.

## Export Flow

**File:** `lib/blueprint/export.js`

### Character Export
```
getBlueprintCharacterNames(blueprint)
  → extractCharactersForExport(names)
    → For each: findCharacterByName() → fetchCharacterCardPNG(avatar) → blobToDataURL()
    → Result: [{name, avatar, pngDataUrl, metadata}]
  → Stored as blueprint.embeddedResources.characters
```

### Persona Export
```
(blueprint.selectedPersonas || blueprint.personaData) names
  + character_arcs names that match a local persona
  → extractPersonasForExport(personaNames)
    → For each: findPersonaByName() → getPersonaData(id) → fetch avatar → dataURL
    → Result: [{id, name, description, title, avatarDataUrl}]
  → Stored as blueprint.embeddedResources.personas
```

### PNG Encoding
Embedded resources are stored as PNG tEXt chunks alongside blueprint JSON. The full character card PNG (including world info in the `chara` tEXt chunk) is preserved as a base64 data URL.

## Import Flow

### Path 1: Blueprint Load (`lib/blueprint/module.js`)

When loading a blueprint with embedded characters not in the library:

```
promptForMissingCharacters(blueprint)
  → detectMissingResources(blueprint)
  → showImportPreviewDialog() — only shows missing resources
  → User selects which to import
  → importCharacterCard(pngDataUrl, name) — uploads PNG via /api/characters/import
  → importPersona(personaData) — sets avatar + metadata via setUserAvatar()
  → getCharacters() — refreshes SillyTavern's in-memory list
  → updateControllerPanel() — refreshes controller counts
```

### Path 2: Scenario Characters Popup (`lib/ui/components/scenario-characters-popup.js`)

"Add to Library" button per embedded resource:

```
handleAddToLibraryClick(name, btn)
  → Find embedded data in blueprint.embeddedResources.characters
  → addEmbeddedCharacterToLibrary(embedded) — wraps importCharacterCard
  → getCharacters() — refresh library
  → showScenarioCharactersPopup() — re-render popup
  → updateControllerPanel() — refresh counts
```

### Path 3: PNG File Import (`lib/blueprint/import.js`)

```
promptForImport(blueprint)
  → showImportPreviewDialog()
  → importMissingResources(embeddedResources, selections)
  → getCharacters() — refresh library
  → showImportResultDialog(result) — toastr notifications
```

### Import Technical Details

- **Character upload:** FormData with PNG file → `POST /api/characters/import`
  - Must use `getRequestHeaders({ omitContentType: true })` for multipart boundary
  - PNG signature verified with `Uint8Array` (not raw `ArrayBuffer`)
- **Persona upload:** `setUserAvatar(file)` + set `power_user.personas[avatarId]` + `power_user.persona_descriptions[avatarId]`

## Standalone Editor

**Files:** `standalone/editors/characters-editor.js`, `standalone/adapters/character-adapter.js`, `lib/bridge/standalone-host.js`

- Characters and personas are read-only and come from the open SillyTavern tab over the BroadcastChannel bridge (`getHostCharacters`, `getHostPersonas`). Without the tab, characters fall back to `POST /api/characters/all`; personas need the tab.
- The Characters tab edits `character_arcs` (add, edit, delete). Linking, embedding and importing happen in the extension.
- The Generate wizard preselects the current persona and sends it as `persona_id`; the host turns it into `personaData` for the request.

## Controller Panel Display

**File:** `lib/ui/controller-panel-content.js` (rendered by `lib/ui/controller-panel.js`)

Uses `getResourceSummaryCounts(blueprint)` to show:
```
Characters  ← clickable, opens Scenario Characters popup
  3 characters (1 embedded | 2 in library)
  1 persona (1 embedded)
```

Click handler opens `showScenarioCharactersPopup()` which renders full cards with avatars and import buttons.

## Key Files Reference

| File | Purpose |
|------|---------|
| `lib/ui/components/scenario-characters.js` | Status detection: `getBlueprintCharactersWithStatus`, `getBlueprintPersonasWithStatus`, `getResourceSummaryCounts` |
| `lib/ui/components/scenario-characters-popup.js` | Draggable popup UI: card rendering, import buttons, event handlers |
| `lib/ui/components/resource-import.js` | `addEmbeddedCharacterToLibrary`, `addEmbeddedPersonaToLibrary` |
| `lib/editor/blueprint-editor/characters-tab.js` | Editor characters tab: picker, linked display, arc CRUD |
| `lib/editor/blueprint-editor/character-handlers.js` | Event delegation for characters tab interactions |
| `lib/blueprint/characters/linker.js` | Library matching, PNG fetch, character/persona import, export extraction |
| `lib/blueprint/characters/discovery.js` | `getAllCharacters`, `getAllPersonas`, `findCharacterByName`, `findPersonaByName` |
| `lib/blueprint/export.js` | Embed characters/personas into blueprint for sharing |
| `lib/blueprint/import.js` | Import embedded resources from loaded blueprints |
| `lib/blueprint/import-ui.js` | Import preview dialog, result notifications |
| `lib/blueprint/module.js` | `promptForMissingCharacters` — auto-import on blueprint load |
| `lib/ui/controller-panel-content.js` | Story controller character counts + popup trigger |
| `lib/generation/orchestration.js` | `addBlueprintMetadata` stores `personaData` on generated blueprints |
| `lib/scenario/injection.js` | `<role>` block, character focus and arc injection (no `final_state`) |
| `lib/story/ledger.js` | Ledger entries with `who_knows` |
| `standalone/editors/characters-editor.js` | Standalone character arc CRUD |
| `lib/bridge/standalone-host.js` | Characters and personas for the standalone editor |
