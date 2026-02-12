# Extending KenoBot

> How to add new capabilities to the bot. Choose the right extension type, follow the steps, and the bot picks it up automatically.

## Two Extension Types

KenoBot has two extension mechanisms: **skills** and **tools**. They serve different purposes and are created differently.

| | Skills | Tools |
|---|---|---|
| **What they are** | Instructions (markdown) that tell the LLM *how* to do something | Code (JavaScript) that *does* something |
| **Analogy** | A recipe card | A kitchen appliance |
| **Language** | Markdown (no coding) | JavaScript (requires coding) |
| **Where they live** | `~/.kenobot/config/skills/<name>/` | `src/tools/` (built-in) or `$TOOLS_DIR/` (external) |
| **Installation** | Drop a folder — no restart needed | Drop a `.js` file in `$TOOLS_DIR` — requires restart |
| **Hot-loadable** | Yes (via approval or restart) | No (requires restart) |
| **Who creates them** | Anyone, including the bot itself | Anyone with JavaScript knowledge |
| **Invocation** | Automatic (keyword match in user message) | LLM decision (tool_use) or user (slash command) |
| **Runs code** | No — guides the LLM to use existing tools | Yes — executes JavaScript with full Node.js access |
| **Context cost** | ~50 bytes at rest, full prompt only when triggered | Always present in tool definitions (~200 bytes each) |
| **Can call tools** | Yes, by instructing the LLM to use them | N/A — they *are* the tools |
| **Self-improvable** | Yes (`SELF_IMPROVEMENT=true`) | Not yet (planned) |

## Decision Guide

```
Do you need to call an external API, run a shell command,
read/write files, or perform any action with side effects?
  │
  ├─ YES → Does a built-in tool already do this?
  │         ├─ YES → Create a SKILL that instructs the LLM to use that tool
  │         └─ NO  → Create a TOOL (requires JavaScript)
  │
  └─ NO → You just need the LLM to behave differently
          (new persona, specific format, workflow, etc.)
           → Create a SKILL
```

**Rule of thumb**: Start with a skill. Only create a tool when you need the bot to do something it physically cannot do today (new API, new protocol, new I/O).

### Common Examples

| Goal | Type | Why |
|------|------|-----|
| Get weather for a city | Skill | Uses existing `web_fetch` tool with wttr.in |
| Summarize daily activity | Skill | Uses existing memory and context |
| Write blog posts in a specific style | Skill | Pure LLM instruction, no new I/O |
| Send emails via Gmail | Skill | Uses existing `n8n_trigger` tool |
| Translate messages to Japanese | Skill | Pure LLM capability |
| Query a private database | Tool | Needs new network connection |
| Integrate with Slack API | Tool | Needs new HTTP client with auth |
| Run a local Python script | Tool | Needs `child_process` execution |
| Read from a hardware sensor | Tool | Needs system-level access |

---

## Creating a Skill (No Code)

Skills are the simplest way to extend the bot. A skill is a folder with two files: a manifest and a prompt.

### File Structure

```
~/.kenobot/config/skills/
  my-skill/
    manifest.json    # Metadata: name, description, trigger keywords
    SKILL.md         # Instructions the LLM follows when triggered
```

### Step 1: Create the Directory

```bash
mkdir -p ~/.kenobot/config/skills/my-skill
```

### Step 2: Write manifest.json

```json
{
  "name": "my-skill",
  "description": "One-line description of what this skill does",
  "triggers": ["keyword1", "keyword2", "keyword3"]
}
```

**Rules**:
- `name` — Unique identifier, max 64 characters, must match directory name
- `description` — Shown in the bot's skill list, max 256 characters. Be specific: this helps the LLM understand when to apply the skill
- `triggers` — Keywords that activate this skill, max 20 triggers, each max 100 characters. Case-insensitive, matched on word boundaries (e.g., `"weather"` matches "what's the weather" but not "weathering")

### Step 3: Write SKILL.md

This is the prompt injected into the LLM's context when the skill is triggered. Write it as instructions for the agent.

```markdown
## My Skill

When the user asks about [topic], follow these steps:

1. [First step — be specific]
2. [Second step — mention which tools to use if needed]
3. [How to format the response]

### Guidelines
- [Any constraints or preferences]
- [Tone, length, format requirements]
```

**Tips for effective SKILL.md**:
- Be specific and actionable — the LLM follows these literally
- Reference built-in tools by name when needed (e.g., "Use the `web_fetch` tool to...")
- Keep it concise — this is injected into the context window on every trigger
- Include example output format if the response should follow a pattern
- Write in imperative mood ("Do X", not "You should do X")

### Step 4: Verify

Restart the bot or, if `SELF_IMPROVEMENT=true`, approve a hot-load. Check logs for:

```
[info] skills: skill_loaded { name: "my-skill", triggers: 3 }
```

Test by sending a message containing one of the trigger keywords.

### Complete Example: Code Reviewer Skill

```
~/.kenobot/config/skills/code-review/
  manifest.json
  SKILL.md
```

**manifest.json**:
```json
{
  "name": "code-review",
  "description": "Review code snippets for bugs, style issues, and improvements",
  "triggers": ["review", "code review", "revisar codigo", "check this code"]
}
```

**SKILL.md**:
```markdown
## Code Review Skill

When the user shares code for review:

1. Identify the language from syntax
2. Check for:
   - Bugs and logic errors (highest priority)
   - Security issues (injection, exposed secrets, unsafe operations)
   - Performance problems (unnecessary loops, missing early returns)
   - Style and readability (naming, structure, complexity)
3. Present findings grouped by severity:
   **Bugs**: [list or "None found"]
   **Security**: [list or "Looks clean"]
   **Performance**: [list or "OK"]
   **Style**: [list or "Clean"]
4. End with a one-line overall assessment

Be direct. Skip compliments. Focus on what needs to change.
If the code is fine, say so in one line.
```

---

## Creating a Tool (JavaScript)

Tools require writing JavaScript. Create a tool when the bot needs a new capability that doesn't exist yet — a new API integration, system command, or I/O operation.

### File Structure

A tool is a single `.js` file. It can live in two places:

```
# Option A: External (recommended for custom tools)
~/.kenobot/config/tools/
  my-tool.js         # Requires TOOLS_DIR=~/.kenobot/config/tools in .env

# Option B: Built-in (for engine contributors)
src/tools/
  my-tool.js         # Part of the engine source
```

Both locations use the exact same file format. External tools (`TOOLS_DIR`) are the recommended approach — they don't require modifying the engine and survive updates.

### Step 1: Configure TOOLS_DIR (once)

Add to your `.env`:
```bash
TOOLS_DIR=~/.kenobot/config/tools
```

The directory is created automatically by `kenobot init`.

### Step 2: Create the Tool File

Create `~/.kenobot/config/tools/my-tool.js` with two exports:
1. A tool class (default export) — implements the tool interface
2. A `register()` function (named export) — self-registration

### Step 3: Implement the Tool

External tools are self-contained — no imports from the engine needed. The registry uses duck typing, so just implement the required methods:

```javascript
/**
 * Tool interface:
 *   get definition()    → { name, description, input_schema } (required)
 *   async execute(input) → string result (required)
 *   get trigger()       → RegExp or null (optional, for slash commands)
 *   parseTrigger(match) → object input (optional, for slash commands)
 *   async init()        → void (optional, async setup after registration)
 *   async stop()        → void (optional, cleanup during shutdown)
 */
export default class MyTool {
  // Required: Tool definition for the LLM (Anthropic tool format)
  get definition() {
    return {
      name: 'my_tool',
      description: 'What this tool does — be specific, the LLM reads this to decide when to use it',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Description of this parameter'
          }
        },
        required: ['query']
      }
    }
  }

  // Optional: Slash command trigger (regex)
  // Enables "/mytool <query>" for providers without native tool_use
  get trigger() {
    return /^\/mytool\s+(.+)/i
  }

  // Optional: Parse slash command match into tool input
  parseTrigger(match) {
    return { query: match[1] }
  }

  // Required: Execute the tool and return a text result
  async execute({ query }) {
    // Your logic here — fetch APIs, run commands, read files, etc.
    return `Result for: ${query}`
  }

  // Optional: Async setup after registration (e.g., connect to DB)
  async init() {}

  // Optional: Cleanup during shutdown (e.g., close connections)
  async stop() {}
}

// Required: Self-registration function
// Called automatically by ToolLoader during startup
export function register(registry, deps) {
  // Optional: skip registration if config is missing
  // if (!deps.config.MY_TOOL_API_KEY) return

  registry.register(new MyTool())
}
```

> **Note**: Built-in tools (`src/tools/`) extend `BaseTool` from `./base.js`, but external tools don't need to — just implement the same methods. No imports from the engine required.

### Step 4: Understand Available Dependencies

The `register()` function receives a `deps` object with:

| Dependency | What it provides |
|---|---|
| `deps.config` | All `.env` configuration values |
| `deps.scheduler` | Cron scheduling service |
| `deps.watchdog` | Health monitoring |
| `deps.circuitBreaker` | Failure circuit breaker |
| `deps.bus` | Event bus (emit/listen events) |
| `deps.skillLoader` | Skill management |
| `deps.identityLoader` | Identity management |

Use only what your tool needs. Most tools only need `deps.config`.

### Step 5: Verify

Restart the bot. Check logs for:

```
[info] tools: tool_loaded { name: "my_tool" }
```

The tool is automatically discovered — no changes to `index.js` or any other file needed.

### BaseTool Interface Reference

| Method/Property | Required | Description |
|---|---|---|
| `get definition()` | Yes | Returns `{ name, description, input_schema }` in Anthropic tool format |
| `async execute(input)` | Yes | Performs the action, returns a string result |
| `get trigger()` | No | Regex for slash command invocation (return `null` to disable) |
| `parseTrigger(match)` | No | Converts regex match to `execute()` input |
| `async init()` | No | Async setup after registration |
| `async stop()` | No | Cleanup during shutdown |

### Security Checklist

Before deploying a custom tool:

- [ ] Validate all inputs — never pass user input directly to shell commands or SQL
- [ ] Block path traversal (`../`) if handling file paths
- [ ] Set timeouts on network requests (`AbortSignal.timeout()`)
- [ ] Block private IP ranges if fetching user-provided URLs (SSRF protection)
- [ ] Never log or expose secrets, API keys, or tokens in tool results
- [ ] Use `execFile` (not `exec`) for shell commands to prevent injection

### Complete Example: Dictionary Lookup Tool

```javascript
// No imports needed — self-contained external tool

export default class DictionaryTool {
  get definition() {
    return {
      name: 'dictionary',
      description: 'Look up word definitions, synonyms, and etymology',
      input_schema: {
        type: 'object',
        properties: {
          word: { type: 'string', description: 'The word to look up' },
          lang: { type: 'string', description: 'Language code (default: en)', enum: ['en', 'es', 'fr', 'de'] }
        },
        required: ['word']
      }
    }
  }

  get trigger() {
    return /^\/define\s+(\S+)(?:\s+(\w{2}))?/i
  }

  parseTrigger(match) {
    return { word: match[1], lang: match[2] || 'en' }
  }

  async execute({ word, lang = 'en' }) {
    const url = `https://api.dictionaryapi.dev/api/v2/entries/${encodeURIComponent(lang)}/${encodeURIComponent(word)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })

    if (!res.ok) {
      if (res.status === 404) return `No definition found for "${word}"`
      throw new Error(`Dictionary API error: ${res.status}`)
    }

    const [entry] = await res.json()
    const meanings = entry.meanings.map(m =>
      `**${m.partOfSpeech}**: ${m.definitions[0].definition}`
    ).join('\n')

    return `## ${entry.word} ${entry.phonetic || ''}\n\n${meanings}`
  }
}

export function register(registry) {
  registry.register(new DictionaryTool())
}
```

---

## Built-in Tools Reference

These tools are available out of the box. Skills can reference them by name in their instructions.

| Tool | Slash Command | Description | Requires |
|------|--------------|-------------|----------|
| `web_fetch` | `/fetch <url>` | Fetch URL, return text (10KB max) | Nothing |
| `schedule` | `/schedule add\|list\|remove` | Cron-based scheduled tasks | Nothing |
| `diagnostics` | `/diagnostics` | System health status | Nothing |
| `workspace` | `/workspace list\|read\|write\|delete` | File operations in workspace | `WORKSPACE_DIR` |
| `github` | `/git status\|commit\|push\|pull\|log` | Git operations | `WORKSPACE_DIR` |
| `pr` | `/pr list\|create\|view\|merge` | GitHub Pull Requests | `WORKSPACE_DIR` + `gh` CLI |
| `n8n_trigger` | `/n8n <workflow> [data]` | Trigger n8n workflow via webhook | `N8N_WEBHOOK_BASE` |
| `n8n_manage` | `/n8n-manage list\|get\|activate` | Manage n8n workflows via API | `N8N_API_URL` + `N8N_API_KEY` |
| `dev` | `/dev <project> <task>` | Run dev tasks in workspace projects | `PROJECTS_DIR` |
| `approval` | `/pending\|review\|approve\|reject` | Manage self-improvement proposals | `WORKSPACE_DIR` + `SELF_IMPROVEMENT` |

## Built-in Skills Reference

Default skills installed by `kenobot init`. Located in `~/.kenobot/config/skills/`.

| Skill | Triggers | Uses Tools | Description |
|-------|----------|-----------|-------------|
| weather | weather, forecast, temperature, clima, tiempo | `web_fetch` | Weather from wttr.in |
| daily-summary | summary, daily, recap, resumen | (memory context) | Daily activity recap |
| gmail | email, mail, inbox, correo, gmail | `n8n_trigger` | Gmail via n8n workflows |
| self-improvement | create skill, improve, propose change | `approval`, `workspace` | Bot creates new skills/workflows |

---

## Further Reading

- [Tools](tools.md) — Full tool documentation, all built-in tools, execution loop
- [Skills](skills.md) — Full skill documentation, hot-loading, self-improvement flow
- [Self-Improvement](self-improvement.md) — How the bot proposes and installs its own skills
- [Architecture](../architecture.md) — How tools and skills integrate with the agent loop
