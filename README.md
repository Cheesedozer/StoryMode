# Story Mode Extension for SillyTavern

**Version:** 1.5.0

---

## 📦 Installation

```
1. In SillyTavern, click Extensions → Install Extension
2. Enter this repository URL:
   https://github.com/Prompt-And-Circumstance/StoryMode
3. Story Mode will appear in Extensions → Story Mode
```

---
## Scenario Blueprint Schema
Details of the schema for the scenario cards implemented in this extension are available here:
https://github.com/Prompt-And-Circumstance/scenario-card-spec-v1

## Overview

**Story Mode** is an extension for SillyTavern that provides tools for a stronger narrative experience while chatting with LLMs. Your persona is always the protagonist: the story puts pressure on you, and you decide what you do.

## Key Features

### 📖 Story Style
Choose from **43 pre-defined story genres** - Mystery, Horror, Fantasy, Sci-Fi, Romance, Action, Drama, and more. Each story type includes:
- Thematic hooks, tone and literary devices
- Pacing guidance for each of the four phases (setup, escalation, climax, resolution)
- A default story shape, and suggested threads where the genre usually has them
- A signature moment the story builds toward

These can be used to provide a loose structure to your roleplay. Point of view is left to the writing style.

### ✍️ Author Style
Choose a writing style, named after the author who inspired it. The model is given a description of the techniques (voice, prose rhythm, description, dialogue), not the author's name, which tends to produce pastiche. A global Mature Content setting (Off / Intimacy / Explicit) controls how far intimate scenes go, and each style describes how its voice writes them.

### 🎭 Mix and Match
Combine any story genre with any author style:
- Tell a **Spy Thriller** in the style of Jane Austen
- Tell a **Romance** in the style of Hemingway
- Tell **Cosmic Horror** in the style of Tolkien

### 🎬 Narrative Arc
Set your story to follow a loose arc over any number of messages (5–150). The story moves through four phases:
- **Setup** (~25%): Who wants what, why, and what stands in the way
- **Escalation** (~50%): Attempts cost something; pressure rises
- **Climax** (~15%): The decisive moment
- **Resolution** (~10%): The aftermath

### 🧭 Story Shapes and Threads
A story's chapters can take different shapes, each with its own stages: **Escalation, Mystery, Tournament, Siege, Journey, Journey and return, Heist, Episodic, Kishōtenketsu, Tragedy, Quiet, Romance and Comedy of errors**. A story has one main arc and up to two threads woven through it, such as a romance inside a heist or a mystery inside a siege. Quiet and kishōtenketsu stories build to a moment of resonance or a turn instead of a confrontation. Scenario blueprints use the same four phases and shapes.

### 🗺️ Scenario Blueprints
Tell structured, multi-scene stories with:
- LLM-generated plans tailored to your premise: arcs, chapters, scenes and beats
- **Tentpoles**: situations that arrive at a set point whatever you have done; you decide how to meet them
- **Complications**: when the story stalls, the one that best fits what you have done so far is brought in
- **Conditional endings**: from the climax on, the story moves toward the ending your choices point to, and the epilogue follows it
- Opening messages and cover art per blueprint
- A **Structure** editor for arcs, chapters, tentpoles, complications and ending conditions, in SillyTavern and in the full-page editor

### 📒 Story Ledger and Tracking
- The **ledger** records your choices, promises, secrets and other things the story has established, and the narrator sees it every turn, so earlier choices keep mattering. It follows swipes, folds finished chapters into summaries, and is hidden by default; you can show it to read and edit it.
- **Tracking** of beats, scenes and the ledger runs on the narrating model (hidden markers) or on a separate, cheaper model after every reply.

### 🖼️ Scenario Library
Store your scenario blueprints as **PNG images** with embedded metadata. Export them as files and share with others—import them right back into any browser.

### 📜 End of Chat tools
- **Epilogue**: Automatically generate a story epilogue when the arc completes
- **Summarization**: Generate a summary of any chat at any time
- **What's Next**: The LLM will generate ideas for your next scenario.

### 🎨 Theme Integration
Integrates seamlessly with SillyTavern theming, including specific support for **Rivelle's Moonlight Echoes** and **SpicyMarinara's RPG Companion**.

---

## Quick Start

1. **Enable Story Mode** in Extensions → Story Mode
2. **Enable Story Arc** in the settings panel
3. **Select a Story Type** (e.g., "Epic Fantasy", "Noir Detective")
4. **Set Arc Length** (messages)
5. **Optional**: Pick a Story Shape and threads, and add an Author Style for the writing
6. **Start chatting**—the extension injects context-aware prompts automatically

---

## Inspiration & Credits

**Author**: Eco54

**Research & Inspiration**
The Scenario Blueprint system is a partial implementation of the **StoryVerse** approach to narrative roleplaying:
[*StoryVerse: Towards Co-authoring Dynamic Plot with LLM-based Character Simulation via Narrative Planning*](https://dl.acm.org/doi/10.1145/3649921.3656987)
(Wang et al., 2024, Autodesk Research)

**Inspiration (and some code) borrowed from:**
- [Moonlight Echoes](https://github.com/RivelleDays/SillyTavern-MoonlitEchoesTheme) by Rivelle
- [RPG Companion](https://github.com/SpicyMarinara/rpg-companion-sillytavern) by SpicyMarinara and others
- [Auto Gen Image](https://github.com/wickedcode01/st-image-auto-generation/blob/main/README_EN.md) by wickedcode01
- and of course SillyTavern!


---

## Version History

See [CHANGELOG.md](./CHANGELOG.md) for detailed release notes.

### v1.5.0 (Current Release)
- Four-phase arcs in Story Mode and blueprints, with 13 story shapes, threads and chapters
- Tentpoles, complications and conditional endings driven by a story ledger of your choices
- Beat and ledger tracking on the narrating model or a secondary model
- Structure tab in both editors; the full-page editor is finished and shares the library
- Prompt rewrite: styles describe technique instead of imitating authors, no trope lists, three-level Mature Content setting
- SillyBunny compatibility fixes (install paths and APIs checked against SillyBunny's source)

### v1.0.0
- 43 pre-defined story types
- Writing styles
- Three-phase narrative arc structure
- Scenario Blueprints with multi-scene, beat-level progression
- File-backed Scenario Library (PNG storage, cross-browser)
- Import/export for blueprints and custom story types
- Epilogue and summarization features
- Full CRUD editor for story types and author styles
- Configurable prompt injection system
- Live prompt preview

---

## Planned Features (v2)

### Campaigns
- **Ongoing campaigns**: stories without a fixed ending, built from sequential arcs (a journey, then a siege) or an episodic main arc, with a ledger that carries over from one story to the next

### Advanced Features
- **World Lore Integration**: Better incorporation of world-building details and lore entries into scenario generation
- **World State Tracking**: Extend the ledger to locations and ongoing events across stories
- **Lorebook Generation**: Auto-generate lorebook entries from scene summaries and the ledger

---

## License

MIT
