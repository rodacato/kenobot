# Skills

> Plugin system for composable capabilities. Drop a directory with a manifest and instructions — the bot picks it up automatically.

## Overview

Skills are higher-level capabilities composed of a **manifest** (metadata + triggers) and a **prompt** (agent instructions). They're loaded on-demand to keep the context window small.

At startup, only `manifest.json` is read. The full `SKILL.md` is loaded into the system prompt only when a message matches a trigger word.

## Skill Structure

Skills live in `~/.kenobot/config/skills/` (or the `SKILLS_DIR` path):

```
~/.kenobot/config/skills/
  weather/
    manifest.json    # { name, description, triggers[] }
    SKILL.md         # Agent instructions (loaded on-demand)
  daily-summary/
    manifest.json
    SKILL.md
```

Default skills (weather, daily-summary) are copied from the engine's `templates/skills/` directory when you run `kenobot setup`.

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

1. **Startup**: `SkillLoader.loadAll()` scans the skills directory, reads all `manifest.json` files, compiles trigger regexes
2. **System prompt**: A compact skill list is injected:
   ```
   ## Available skills
   - weather: Get weather forecasts and current conditions
   - daily-summary: Generate a summary of your day
   ```
3. **Trigger matching**: When a message contains a trigger word (e.g., "weather"), `SkillLoader.match(text)` returns the matching skill. The full `SKILL.md` is loaded via `getPrompt()` and injected:
   ```
   ## Active skill: weather
   [Full SKILL.md content]
   ```
4. **Next message**: The skill prompt is unloaded (only loaded while relevant)

This keeps context small: 100 skills = ~5KB in system prompt (just names + descriptions). Full prompts loaded only when needed.

## SkillLoader Lifecycle

```
SkillLoader
  constructor(skillsDir)
  loadAll()      — scan directory, read manifests, compile triggers
  loadOne(name, dir)  — hot-load a single skill (used after approval)
  match(text)    — match message against trigger regexes
  getPrompt(name) — load SKILL.md on-demand
  getAll()       — compact list for system prompt
  size           — number of loaded skills
```

Unlike tools, skills don't need a registry or dependency injection — they are pure data (manifest + prompt text) with no code to execute. The agent uses them as context, not as callable functions.

## Hot-loading

Skills can be added at runtime without restarting the bot. The `approval` tool calls `SkillLoader.loadOne(name, dir)` when a proposed skill is approved. This:

1. Reads the new skill's `manifest.json`
2. Compiles its trigger regex
3. Adds it to the in-memory skill map
4. The skill is immediately available for trigger matching

## Self-Improvement Flow

When `SELF_IMPROVEMENT=true`, the bot can propose new skills via the `approval` tool:

1. **Bot proposes**: The LLM creates a `manifest.json` + `SKILL.md` and submits via `approval propose`
2. **Proposal stored**: Files are written to a pending proposals directory in the workspace
3. **Owner notified**: A notification is sent to the owner's Telegram chat
4. **Owner reviews**: `/pending` lists proposals, `/review <id>` shows details
5. **Owner decides**: `/approve <id>` or `/reject <id> "reason"`
6. **On approval**: Files are copied to the skills directory and hot-loaded via `loadOne()`
7. **Config sync**: If `CONFIG_REPO` is set, the new skill is auto-committed and pushed

## Configuration

```bash
SKILLS_DIR=~/.kenobot/config/skills  # Directory to scan for skill plugins (default)
SELF_IMPROVEMENT=true                # Enable bot-proposed skills (requires WORKSPACE_DIR)
```

## Creating a Custom Skill

1. Create the skill directory:
   ```bash
   mkdir -p ~/.kenobot/config/skills/blog-writer
   ```

2. Create `manifest.json`:
   ```json
   {
     "name": "blog-writer",
     "description": "Draft technical blog posts with code examples",
     "triggers": ["blog", "article", "post", "write"]
   }
   ```

3. Create `SKILL.md`:
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

4. Restart the bot (or let it hot-load via approval). The skill is auto-discovered. Check logs for:
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

## See Also

- [Extending KenoBot](extending.md) — When to create a skill vs a tool, decision guide, comparison table
- [Tools](tools.md) — For capabilities that require JavaScript code execution

## Source

- [src/skills/loader.js](../../src/skills/loader.js) — Discovery, loading, and matching
- [src/agent/context.js](../../src/agent/context.js) — System prompt injection
- [templates/skills/weather/](../../templates/skills/weather/) — Default skill template
- [templates/skills/daily-summary/](../../templates/skills/daily-summary/) — Default skill template
- [test/skills/](../../test/skills/) — Tests
