# Story Mode Extension for SillyTavern

**Version:** 1.1.0

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

**Story Mode** is an extension for SillyTavern that provides tools for a stronger narrative experience while chatting with LLMs. 
## Key Features

### 📖 Story Style
Choose from **43 pre-defined story genres** - Mystery, Horror, Fantasy, Sci-Fi, Romance, Action, Drama, and more. Each story type includes:
- Thematic hooks and tone guidance
- Genre-appropriate tropes and literary devices
- Pacing and POV suggestions
- Four-phase arc guidance (setup, escalation, climax, resolution)

These can be used to provide a loose strucutre to your rolepay.

### ✍️ Author Style
Choose a writing style, named after the author who inspired it. The model is given a description of the techniques (voice, prose rhythm, description, dialogue), not the author's name, which tends to produce pastiche. A global Mature Content setting (Off / Intimacy / Explicit) controls how far intimate scenes go, and each style describes how its voice writes them.

### 🎭 Mix and Match
Combine any story genre with any author style:
- Tell a **Spy Thriller** in the style of Jane Austen
- Tell a **Romance** in the style of Hemingway
- Tell **Cosmic Horror** in the style of Tolkien

### 🎬 Narrative Arc
Set your story to follow a loose arc over any number of messages (5–50+). The LLM receives phase-specific guidance as it progresses through:
- **Setup** (~25%): Who wants what, why, and what stands in the way
- **Escalation** (~50%): Attempts cost something; pressure rises
- **Climax** (~15%): The decisive confrontation
- **Resolution** (~10%): The aftermath

Scenario blueprints use the same four phases.

### 🗺️ Scenario Blueprints
Tell structured, multi-scene stories with:
- Scene-by-scene progression and beat tracking
- LLM-generated narrative plans tailored to your premise
- Opening messages and cover art per blueprint
- Signal-based pacing (`@@BEAT:N@@`, `@@NEXT_SCENE@@`)

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
5. **Optional**: Add an Author Style for prose emulation
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

### v1.0.0 (Current Release)
- 43 pre-defined story types
- Writing styles with a three-level Mature Content setting
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

### Advanced Features
- **World Lore Integration**: Better incorporation of world-building details and lore entries into scenario generation
- **World State Tracking**: Track and maintain evolving world states, locations, and ongoing events across scenes and story arcs
- **Lorebook Geneation**: Auto-generate lorebook entries from scene summaries and beat completions

---

## License

MIT
