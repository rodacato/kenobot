# Conversation Scenario Tests

Declarative conversation testing framework for KenoBot. Define multi-turn conversations as data, run them against an isolated bot instance, and assert on memory, identity, sessions, and system prompt state.

## Quick Start

```bash
# Run all conversation scenarios
npm run test:conversations

# Run a specific scenario file
npx vitest run test/conversations/scenarios/memory.test.js
```

## Architecture

```
Scenario (JS object)
  → Runner (orchestrator — creates isolated app, sends turns, runs assertions)
    → Harness (test/e2e/harness.js — temp dir, MockProvider, HTTP channel)
      → Inspector (read-only state helpers for assertions)
```

Each `runScenario()` call creates a fully isolated bot instance with its own temp directory, MockProvider, and HTTP channel. Tests cannot affect each other.

## Scenario Format

```js
import { runScenario } from '../runner.js'

await runScenario({
  // Required: unique name (slugified to chatId)
  name: 'my-scenario',

  // Optional: pre-start setup (write files, seed data)
  setup: async ({ dataDir, identityDir, sessionsDir }) => {
    await writeFile(join(identityDir, 'BOOTSTRAP.md'), '...')
  },

  // Optional: config overrides for createTestApp
  config: { HTTP_TIMEOUT: '30000' },

  // Required: conversation turns
  turns: [
    {
      user: 'message from user',           // Required
      response: 'mock provider response',   // Optional (scripts MockProvider)
      chatId: 'override-chat-id',           // Optional (for multi-chat scenarios)
      assert: async ({                      // Optional
        result,      // { status, body } from HTTP response
        state,       // Inspector instance
        provider,    // MockProvider (lastCall, etc.)
        sessionId    // Full session ID (e.g. "http-http-my-scenario")
      }) => {
        expect(result.status).toBe(200)
        expect(result.body.response).toContain('expected text')
      }
    }
  ]
})
```

## Adding a New Scenario

1. Create `test/conversations/scenarios/my-feature.test.js`
2. Add the standard mocks at the top (copy from any existing scenario)
3. Define turns and assertions
4. Run with `npx vitest run test/conversations/scenarios/my-feature.test.js`

Template:

```js
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), configure: vi.fn() },
  Logger: class { constructor() { this.info = vi.fn(); this.warn = vi.fn(); this.error = vi.fn(); this.configure = vi.fn() } }
}))

vi.mock('grammy', () => ({
  Bot: class { constructor() { this.api = { sendMessage: vi.fn(), sendChatAction: vi.fn(), getMe: vi.fn().mockResolvedValue({ id: 12345, username: 'test_bot' }) } }; on() {}; async start() {}; async stop() {} }
}))

import { runScenario } from '../runner.js'

describe('Scenario: My feature', () => {
  it('should do something', async () => {
    await runScenario({
      name: 'my-feature-basic',
      turns: [
        {
          user: 'hello',
          response: 'Hi! <memory>user said hello</memory>',
          assert: async ({ result, state, sessionId }) => {
            expect(result.status).toBe(200)
            const daily = await state.getDailyLog()
            expect(daily).toContain('user said hello')
          }
        }
      ]
    })
  }, 15000)
})
```

## Inspector API Reference

| Method | Returns | Description |
|--------|---------|-------------|
| `getDailyLog(date?)` | `string` | Global daily log (today by default) |
| `getLongTermMemory()` | `string` | Global MEMORY.md |
| `getChatDailyLog(sessionId, date?)` | `string` | Per-chat daily log |
| `getChatLongTermMemory(sessionId)` | `string` | Per-chat MEMORY.md |
| `getChatContext(sessionId)` | `string\|null` | Per-chat context description (context.md) |
| `getWorkingMemory(sessionId)` | `string\|null` | Working memory content |
| `getPreferences()` | `string` | Identity preferences.md |
| `isBootstrapping()` | `boolean` | BOOTSTRAP.md exists? |
| `getSessionHistory(sessionId)` | `Array` | Parsed JSONL session entries |
| `getProceduralPatterns()` | `Array` | Parsed procedural patterns.json |
| `getLastSystemPrompt()` | `string` | System prompt from last provider call |
| `getLastProviderCall()` | `Object` | Full `{ messages, options }` from MockProvider |
| `sessionId(chatId)` | `string` | Converts chatId to full session ID |

All read methods return empty string (`''`) or `null` when the file doesn't exist, so assertions stay clean.

## Tips

**Session ID convention**: HTTP channel creates session IDs as `http-http-{chatId}`. Use the injected `sessionId` in assertions instead of calling `state.sessionId()` manually.

**Timeouts**: Each test should have a 15000ms timeout (15s). Multi-turn scenarios with 7+ turns should use 30000ms.

**MockProvider scripting**: `setNextResponse(text)` queues one text response; `queueResponse(obj)` queues a full response object (with `content`, `toolCalls`, `stopReason`, `rawContent`). Use `queueResponse` to script multi-step tool_use flows. Queued responses are consumed FIFO. For bootstrap scenarios, internal calls (ProfileInferrer) may consume responses before the actual turn — keep this in mind for multi-phase tests.

**Tag stripping**: Tag extractors may leave extra whitespace where tags were. Assert with `toContain` rather than `toBe` for response text with tags removed.

**Per-turn chatId**: Use `turn.chatId` to test multi-chat scenarios (e.g., memory isolation) within a single `runScenario()` call.

**Tool use scripting**: For Motor System tests that bypass `runScenario()`, use `createTestApp()` directly with `provider.queueResponse()`. Use the `toolUseResponse(text, toolCalls)` and `endTurnResponse(text)` helpers from `motor-system.test.js`. Always call `mockTools(harness)` to replace real tools (search_web, fetch_url, github_setup_workspace) with fast mocks that avoid HTTP/git calls.

**Background task tests**: Background tasks run asynchronously via TaskRunner. Use `Promise.race` with a timeout when waiting for signals like `task:completed` or `task:failed`. Allow extra time in `afterEach` for background tasks to settle before cleanup.

## Current Scenarios

| File | Tests | What it covers |
|------|-------|----------------|
| `memory.test.js` | 7 | Global memory, chat memory, isolation, combined tags, plain response |
| `working-memory.test.js` | 4 | Persist, replace, context inclusion, persistence without replacement |
| `identity.test.js` | 3 | Core identity, memory tag instructions, retrieval integration |
| `multi-turn.test.js` | 2 | History ordering in provider context, session persistence |
| `bootstrap.test.js` | 3 | Bootstrap detection, completion, non-bootstrap mode |
| `chat-context.test.js` | 7 | Chat context persistence, replacement, prompt injection, multi-chat isolation, tag coexistence |
| `motor-system.test.js` | 14 | Inline ReAct loop, tool registration, background tasks, multi-step tool use, task lifecycle (COMPLETED/FAILED/PROGRESS), concurrent task rejection, memory tags with tool iterations |

## Future Improvements

Based on expert reviews (QA Strategist, Cognitive Scientist, Software Architect):

### High Priority

- **Provider error scenarios**: Add `setNextError(error)` to MockProvider + `turn.error` to runner. Test agent loop error handling.
- **Full bootstrap lifecycle**: Multi-turn test covering all 4 phases (observe, checkpoint, boundaries, complete).
- **Consolidation round-trip**: Test the full encoding → storage → sleep cycle → retrieval loop.
- **Approval workflow scenarios**: Test approval:proposed → approved/rejected signal flow.

### Medium Priority

- **Procedural memory scenarios**: Seed patterns.json, trigger keyword match, assert pattern surfaces in context.
- **Context-level memory isolation**: Verify chat A's memory doesn't appear in chat B's system prompt.
- **Working memory staleness**: Seed stale working memory (>7 days), verify excluded from prompt.
- **Extract vi.mock boilerplate**: Use vitest `setupFiles` to centralize logger/grammy mocks.

### Low Priority

- **Nested/malformed tag handling**: Test `<memory><memory>nested</memory></memory>`, unclosed tags.
- **Bootstrap-to-normal transition**: Start bootstrap, complete, verify next turn has memory but no bootstrap section.
- **Concurrent messages**: Test two simultaneous messages to same chatId.
