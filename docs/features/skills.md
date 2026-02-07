# Skills

> Plugin system for composable capabilities. Drop a directory with a manifest and instructions — the bot picks it up automatically.

## Overview

Skills are higher-level capabilities composed of a **manifest** (metadata + triggers) and a **prompt** (agent instructions). They're loaded on-demand to keep the context window small.

At startup, only `manifest.json` is read. The full `SKILL.md` is loaded into the system prompt only when a message matches a trigger word.

## Skill Structure

```
skills/
  weather/
    manifest.json    # { name, description, triggers[] }
    SKILL.md         # Agent instructions (loaded on-demand)
  daily-summary/
    manifest.json
    SKILL.md
```

### manifest.json

```json
{
  "name": "weather",
  "description": "Get weather forecasts and current conditions for any location",
  "triggers": ["weather", "forecast", "temperature", "clima", "tiempo"]
}
```

Required fields:
- `name` — Unique skill identifier
- `description` — Short description (shown in system prompt skill list)
- `triggers` — Array of keywords that activate this skill (case-insensitive, word-boundary matched)

### SKILL.md

Agent instructions loaded when the skill is triggered:

```markdown
## Weather Skill

When asked about weather, follow these steps:

1. Extract the location from the user's message
2. Use the `web_fetch` tool to get weather data:
   - Fetch `https://wttr.in/{location}?format=j1` for JSON weather data
3. Present the response concisely

Keep it brief. People just want the basics.
```

## How It Works

1. **Startup**: `SkillLoader` scans the `skills/` directory, reads all `manifest.json` files
2. **System prompt**: A compact skill list is injected:
   ```
   ## Available skills
   - weather: Get weather forecasts and current conditions
   - daily-summary: Generate a summary of your day
   ```
3. **Trigger matching**: When a message contains a trigger word (e.g., "weather"), the full `SKILL.md` is loaded and injected:
   ```
   ## Active skill: weather
   [Full SKILL.md content]
   ```
4. **Next message**: The skill prompt is unloaded (only loaded while relevant)

This keeps context small: 100 skills = ~5KB in system prompt (just names + descriptions). Full prompts loaded only when needed.

## Configuration

```bash
SKILLS_DIR=./skills  # Directory to scan for skill plugins (default: ./skills)
```

## Creating a Custom Skill

1. Create the skill directory:
   ```bash
   mkdir -p skills/blog-writer
   ```

2. Create `skills/blog-writer/manifest.json`:
   ```json
   {
     "name": "blog-writer",
     "description": "Draft technical blog posts with code examples",
     "triggers": ["blog", "article", "post", "write"]
   }
   ```

3. Create `skills/blog-writer/SKILL.md`:
   ```markdown
   ## Blog Writer Skill

   When asked to write a blog post:

   1. Ask for the topic if not specified
   2. Use `web_fetch` to research if needed
   3. Draft in markdown with clear structure:
      - Introduction (1-2 paragraphs)
      - Body with code examples
      - Conclusion
   4. Target 800-1200 words
   5. Use a conversational, technical tone
   ```

4. Restart the bot — the skill is auto-discovered. Check logs for:
   ```
   [info] skills: skill_loaded { name: "blog-writer", triggers: 4 }
   ```

## Built-in Skills

### weather

Triggers: `weather`, `forecast`, `temperature`, `clima`, `tiempo`

Uses `web_fetch` to get data from wttr.in and presents a concise weather summary.

### daily-summary

Triggers: `summary`, `daily`, `recap`, `resumen`

Generates a summary of recent activity using memory and conversation context.

## Source

- [src/skills/loader.js](../src/skills/loader.js) — Discovery and loading
- [src/agent/context.js](../src/agent/context.js) — System prompt injection
- [skills/weather/](../skills/weather/) — Example skill
- [test/skills/](../test/skills/) — Tests
