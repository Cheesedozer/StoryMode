# Author Style Generator

Please describe the author or writing style you'd like to emulate. You can specify:
- A specific author's name (e.g., "Stephen King", "Jane Austen")
- A writing style description (e.g., "noir detective fiction", "cozy mystery")
- A combination of influences (e.g., "Hemingway's minimalism with Gothic atmosphere")

---

Based on your input, create a comprehensive author style definition following this exact JSON schema. You can output either a single object or an array (both formats are supported for import):

```json
{
  "id": "[lowercase_snake_case_unique_identifier]",
  "name": "[Display Name - author name or style title]",
  "category": ["[Category1]", "[Category2 if applicable]"],
  "authorPrompt": "[Detailed writing style instructions - see guidelines below]",
  "nsfwPrompt": "[Guidelines for handling romantic/mature content in this style]",
  "keywords": ["[keyword1]", "[keyword2]", "[keyword3]", "[keyword4]", "[keyword5]"]
}
```

## Field Guidelines

### id
- Use lowercase letters and underscores only
- For authors: `firstname_lastname` (e.g., `stephen_king`)
- For styles: `descriptive_style_name` (e.g., `noir_detective`)

### name
- For authors: Full name as commonly known
- For styles: Descriptive title (e.g., "Gothic Horror", "Cozy British Mystery")

### category
- 1-3 relevant categories that help users find this style
- Examples: "Horror", "Literary Fiction", "Romance", "Thriller", "Comic Fantasy", "Hard SF", "Victorian", "Noir", "YA"

### authorPrompt
This is the core instruction that guides the AI's writing. Include:

1. **No names in the instructions**: describe the techniques directly. The narrating model works better from concrete technique than from "write like [author]", which tends to produce pastiche and borrowed characters. Keep the author's name for the `name` and `keywords` fields only.

2. **Prose characteristics**: Sentence structure, rhythm, complexity
   - Long/short sentences? Complex/simple? Flowing/staccato?

3. **Narrative voice**: POV tendencies, distance, tone
   - First/third person? Close/distant? Warm/detached?

4. **Descriptive approach**: How setting, action, and emotion are rendered
   - Sparse/lush? Sensory focus? Symbolic?

5. **Dialogue style**: How characters speak
   - Naturalistic/stylized? Dialect? Subtext-heavy?

6. **Distinctive techniques**: Signature elements that define this style
   - Specific literary devices, structural quirks, thematic preoccupations

7. **Atmosphere/mood**: The overall feeling the prose should evoke

### nsfwPrompt
How this voice writes romance, desire, and sex scenes:
- What does the prose notice, and in what register?
- What are these scenes usually about for the characters (power, comedy, tenderness, danger)?
- Describe the voice only; how explicit to be is set separately by the user's Mature Content setting.

### keywords
5-8 searchable terms including:
- Author name or key works (if applicable)
- Genre markers
- Distinctive techniques
- Mood/atmosphere descriptors

---
