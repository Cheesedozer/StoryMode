# Genre Mashup Generator

Please provide 2-3 genres you would like to mash up (e.g., Cowboys, Hard SciFi, Pulp Romance):

---

Based on your selected genres, build a comprehensive genre description following this schema:

Name: [Creative mashup name]

CATEGORY Tags: [Relevant category tags]

STORY PROMPT:
[2-3 sentence overview combining all genre elements with their key characteristics and conflicts]

***Thematic Hook:*** [Core premise that integrates all genres - what kind of protagonist faces what kind of challenge that combines genre elements]

***Narrative Scope:*** [Range of story scale from personal to epic]

***Tone:*** [4-6 descriptive tone words separated by commas]

***Literary Devices:*** Foreshadowing: [approach], Symbolism: [approach], Irony: [approach]

***Subgenre:*** [Specific subgenre classification]

***Pacing:*** [Pacing description]


***Structure:*** [Narrative structure approach]

***Priority:*** [Top priority] > [Second priority] > [Third priority]

## Narrative Arc Phases

PROGRESS TEMPLATE:
Arc Progress: Step {currentStep}/{arcLength} ({arcPercent}% complete). Phase: {phase} - Round {positionInPhase}/{totalInPhase} ({phasePercent}% through {phase}).

### SETUP PHASE (~25% OF THE STORY):
[2-3 sentences: who wants what, why, and what stands in the way, using elements from both genres.]

### ESCALATION PHASE (~50%):
[2-3 sentences: how attempts fail, cost, or reveal, and how the two genres' pressures compound.]

### CLIMAX PHASE (~15%):
[2-3 sentences: the shape of the decisive confrontation where both genres' conflicts come to a head. Describe the situation, not the outcome.]

### RESOLUTION PHASE (~10%):
[1-2 sentences: what the aftermath focuses on.]

---

## JSON Export Format

After generating the genre mashup above, also provide an importable JSON version following this schema:

```json
{
  "id": "[lowercase_snake_case_mashup_name]",
  "name": "[Display Name from above]",
  "category": ["[Category1]", "[Category2]"],
  "storyPrompt": "[Combine the overview and all *** sections into a single string, using \\n for line breaks]",
  "progressTemplate": "Arc Progress: Step {currentStep}/{arcLength} ({arcPercent}% complete). Phase: {phase} - Round {positionInPhase}/{totalInPhase} ({phasePercent}% through {phase}).",
  "phasePrompts": {
    "setup": "[SETUP PHASE content]",
    "escalation": "[ESCALATION PHASE content]",
    "climax": "[CLIMAX PHASE content]",
    "resolution": "[RESOLUTION PHASE content]"
  }
}
```
