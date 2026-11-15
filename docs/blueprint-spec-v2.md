# Scenario Blueprint Specification, v2

A scenario blueprint is a JSON document describing one finite, interactive story. Story Mode stores it inside a PNG (the cover image) as an `iTXt` chunk, so a blueprint can be shared as a single image file.

Version 2 extends [v1](https://github.com/Prompt-And-Circumstance/scenario-card-spec-v1) with story arcs, chapters, tentpoles, complications, conditional endings and choice tags. Every v1 field keeps its meaning, and a v1 blueprint is a valid v2 blueprint. Readers that only understand v1 ignore the v2 fields.

This document describes the fields as Story Mode 1.5.0 reads and writes them. The code is the reference implementation: normalization in `lib/blueprint/normalization.js`, arcs and chapters in `lib/story/`.

## Versioning

| Field | Value | Meaning |
|-------|-------|---------|
| `schema_version` | `2` | Blueprint JSON version. Absent means v1. |

The PNG container is unchanged: the `VERSION` text chunk stays `1.0.0`, because it describes the chunk layout, not the JSON.

## Conventions

- **Ids** are lowercase `snake_case`.
- **Stage keys** name an arc stage as `"<arc id>:<stage id>"`, for example `"spine:preparation"`. Readers also accept `"<arc id>.<stage id>"` and, for the spine, `"main:<stage id>"`.
- **Tags** are lowercase `snake_case` labels for what the player did, such as `spared_the_guard`. They are the shared vocabulary between choice points, the runtime ledger, complications and endings.
- **Chapters and scenes** are 0-based in data and 1-based in any UI.
- **The protagonist** is always the player's persona. Text describing what happens to them describes situations, never their decisions or feelings.

## Top-level fields

v1 fields are summarized here; see the v1 spec for their detail.

| Field | Type | v | Notes |
|-------|------|---|-------|
| `blueprint_id` | UUID string | 1 | |
| `blueprint_title` | string | 1 | |
| `story_type_id`, `story_type_name` | string | 1 | Plus inline `story_type_*` copies for portability |
| `author_style`, `author_style_name`, `author_style_prompt` | string | 1 | |
| `core_premise` | string | 1 | 1–5 sentences: protagonist, catalyst, want, motivation, obstacle |
| `setting` | `{location, time_period, atmosphere}` | 1 | |
| `antagonistic_forces` | `{description, nature, motivation, manifestations[]}` | 1 | |
| `arc_structure` | `{opening_hook, escalation_pattern, climax_nature, resolution_style}` | 1 | In v2, a four-line summary of the spine |
| `tone_and_style` | `{primary_tone, narrative_voice, pacing, key_stylistic_elements[]}` | 1 | |
| `content_boundaries` | `{violence_level, romance_level}` | 1 | The story's intended intensity, within the reader's own content settings |
| `protagonist_group` | `{description, shared_goal, group_dynamic}` | 1 | |
| `character_arcs[]` | see v1 | 1 | Includes the persona |
| `scene_plan[]` | Scene | 1 | v2 adds `chapter` and choice point `tags` |
| `primary_ending`, `alternate_endings[]` | Ending | 1 | v2 adds `id` and `reached_if` |
| `opening_message` | string | 1 | |
| `personaData[]` | `{id, name}` | 2 | The personas the story was written for (`selectedPersonas` in older files) |
| `arcs[]` | Arc | 2 | One spine and up to two threads |
| `chapters[]` | Chapter | 2 | Optional; see below |
| `tentpoles[]` | Tentpole | 2 | |
| `complications[]` | Complication | 2 | |
| `schema_version` | `2` | 2 | |

## Arcs

A story arc is a group of chapters with a shape. A blueprint has exactly one **spine** (it carries the main question and decides the ending) and at most two **threads** woven through it.

```json
"arcs": [
  {
    "id": "spine",
    "role": "spine",
    "shape": "heist",
    "question": "Can the crew empty the vault?",
    "stage_notes": { "objective": "The vault holds the ledger that ruined the locksmith." }
  },
  { "id": "romance", "role": "thread", "shape": "romance", "question": "Will Mira and the locksmith risk it?" }
]
```

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | `"spine"` for the spine; threads default to their shape id |
| `role` | `"spine"` \| `"thread"` | The first arc marked spine (or else the first arc) is the spine |
| `shape` | shape id | See the table below |
| `question` | string | Optional; the open question the arc asks |
| `stage_notes` | `{ stage id: string }` | Optional; how each stage plays out in this story |

A blueprint without `arcs` plays as an Escalation spine whose stages follow the scenes' phases.

### Shapes

Each shape's stages fall into one of the four pacing phases: setup (~25%), escalation (~50%), climax (~15%) and resolution (~10%). Shapes marked *no conflict* treat the climax as a turn or a moment of resonance.

| Shape id | Stages (phase) |
|----------|----------------|
| `escalation` | disturbance (setup), growing_difficulty, turn (escalation), confrontation (climax), aftermath (resolution) |
| `mystery` | question, inquiry, changing_interpretations, discovery, consequences |
| `tournament` | entry, contests, changing_strategies, final_contest, outcome |
| `siege` | threat, preparations, sustained_pressure, breaking_point, resolution |
| `journey` | departure, encounters, changing_circumstances, last_obstacle, arrival |
| `journey_return` | departure, encounters, changing_circumstances, last_obstacle, return |
| `heist` | objective, preparation, execution, goes_wrong, aftermath |
| `episodic` | premise, episodes, payoff, rest |
| `kishotenketsu` *(no conflict)* | introduction, development, turn, connection |
| `tragedy` | path, conditions, loss, consequences |
| `quiet` *(no conflict)* | shared_experiences, observation, small_developments, resonance, rest |
| `romance` | separate_lives, meeting (setup), deepening, crisis, commitment |
| `comedy_of_errors` | misunderstanding, complications, collision, reconciliation |

Unless noted, the first stage is setup, the last is resolution, the one before it is climax, and the rest are escalation. The exact mapping lives in `lib/story/shapes.js`.

## Chapters

A chapter is a stretch of play that advances one or more arc stages and holds one or more scenes.

```json
"chapters": [
  { "index": 0, "title": "The Offer", "summary": "The job arrives.", "advances": ["spine:objective", "romance:meeting"] },
  { "index": 1, "title": "Casing", "advances": ["spine:preparation", "romance:deepening"] }
]
```

Each scene names its chapter with `scene.chapter`. Scenes run through chapters in order; a scene without a chapter belongs to the previous scene's chapter.

**Coordination rules.** Writers should follow these, and Story Mode repairs violations when it generates a blueprint:

1. The spine's climax stage comes last among the climaxes. A thread's climax lands in an earlier chapter or in the same chapter.
2. At most one thread reaches its climax in any chapter.

An arc's current stage at a scene is the latest stage it advanced in that scene's chapter or any earlier one.

**Without chapters**, each scene is its own chapter. Its stages come from `scene.arc_stages` (an array of stage keys) if present, otherwise from its phase.

## Scenes (v2 additions)

| Field | Type | Notes |
|-------|------|-------|
| `chapter` | integer | Index into `chapters` |
| `choice_points[].tags` | string[] | One tag per approach, naming what the protagonist did |
| `arc_stages` | string[] | Only in blueprints without chapters |
| `is_ending_scene` | boolean | Set on the final scene Story Mode appends; it plays whichever ending the story leans toward |

## Conditions

Tentpoles, complications and endings use one condition format, checked against the runtime ledger's tags, the arc stages reached, and the current chapter:

```json
{ "tags_all": ["lied_to_guard"], "tags_any": ["took_job"], "tags_none": ["spared_guard"], "stage": "spine:preparation", "chapter_min": 2 }
```

| Key | Holds when |
|-----|-----------|
| `tags_all` | every listed tag is present |
| `tags_any` | at least one listed tag is present |
| `tags_none` | none of the listed tags is present |
| `stage` | that arc stage has been reached |
| `chapter_min` | the current chapter is this one or later |

All keys are optional; an empty condition always holds. A condition's **specificity** is the number of `tags_all` entries, plus 1 for `tags_any`, plus 0.5 per `tags_none` entry, plus 1 for `stage`, plus 0.5 for `chapter_min`.

## Tentpoles

Situations that arrive at a set point whatever the player has done. The player steers how the protagonist meets one, not whether it arrives.

```json
{
  "id": "double_cross",
  "name": "The Double-Cross",
  "trigger": { "chapter_min": 2 },
  "situation": "Vasquez sells the crew out to the bank.",
  "ways_to_meet": ["expose him", "outplay him"],
  "setup_hooks": ["Vasquez takes calls he will not explain"]
}
```

`trigger` is a condition; generators may write `{ "chapter": N }` as shorthand for `{ "chapter_min": N }`. A tentpole fires once, the first time its trigger holds, and only one is in motion at a time. Blueprints from before v2 get one tentpole from the story type's memorable element, but only when a scene already mentions it by name.

## Complications

Brought in when the story stalls (several replies without beat, scene or ledger progress). Among those whose `when` holds, the most specific is chosen; ties go to the earlier one.

```json
{ "id": "guard_talks", "name": "The guard talks", "when": { "tags_all": ["bribed_guard"] }, "situation": "The bribed guard brags at a tavern.", "once": true }
```

`once` defaults to `true`.

## Endings (v2 additions)

```json
"primary_ending": { "id": "clean_exit", "title": "Clean Exit", "reached_if": {}, "...": "v1 fields" },
"alternate_endings": [
  { "id": "mercy", "title": "Mercy", "reached_if": { "tags_any": ["spared_guard"] } },
  { "id": "caught", "title": "Caught", "reached_if": { "tags_all": ["bribed_guard"], "tags_none": ["spared_guard"] } }
]
```

From the climax on, each ending is scored against the ledger's tags. Missing `tags_all` or present `tags_none` rule an ending out; otherwise it scores 2 per `tags_all` tag plus 1 per matched `tags_any` tag. The highest score wins, the primary ending wins ties and is the fallback, and the choice is fixed once the resolution begins.

## Runtime state (not part of the blueprint)

For implementers: Story Mode keeps play state per chat, not in the blueprint. It holds the scene index, beat statuses, the ledger (`{type, text, tags, who_knows, chapter, ...}`), fired tentpoles, used complications, events in motion, a stall counter and the ending lean. See `ARCHITECTURE.md`.
