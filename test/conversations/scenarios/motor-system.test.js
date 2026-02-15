import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), configure: vi.fn() },
  Logger: class { constructor() { this.info = vi.fn(); this.warn = vi.fn(); this.error = vi.fn(); this.configure = vi.fn() } }
}))

vi.mock('grammy', () => ({
  Bot: class { constructor() { this.api = { sendMessage: vi.fn(), sendChatAction: vi.fn(), getMe: vi.fn().mockResolvedValue({ id: 12345, username: 'test_bot' }) } }; on() {}; async start() {}; async stop() {} }
}))

import { createTestApp } from '../../e2e/harness.js'

// Helper: create a tool_use response object
function toolUseResponse(text, toolCalls) {
  return {
    content: text,
    toolCalls,
    stopReason: 'tool_use',
    rawContent: [
      { type: 'text', text },
      ...toolCalls.map(tc => ({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input }))
    ],
    usage: { mock: true }
  }
}

// Helper: create an end_turn response object
function endTurnResponse(text) {
  return {
    content: text,
    toolCalls: null,
    stopReason: 'end_turn',
    rawContent: null,
    usage: { mock: true }
  }
}

describe('Scenario: Motor System — Inline ReAct loop', () => {
  let harness

  afterEach(async () => {
    if (harness) {
      await new Promise(resolve => setTimeout(resolve, 100))
      await harness.cleanup()
    }
  })

  it('should execute tool and return final response after single iteration', async () => {
    harness = await createTestApp()
    const { provider, sendMessage } = harness

    // Script: provider returns tool_use, then end_turn
    provider.queueResponse(
      toolUseResponse("I'll search for that.", [
        { id: 'tc_1', name: 'search_web', input: { query: 'vitest' } }
      ])
    )
    provider.queueResponse(endTurnResponse('Vitest is a fast unit test framework.'))

    const result = await sendMessage('search for vitest', 'react-single')

    expect(result.status).toBe(200)
    expect(result.body.response).toBe('Vitest is a fast unit test framework.')
  }, 15000)

  it('should preserve clean session history after tool iterations', async () => {
    harness = await createTestApp()
    const { provider, sendMessage, dataDir } = harness

    provider.queueResponse(
      toolUseResponse('Searching...', [
        { id: 'tc_1', name: 'search_web', input: { query: 'test' } }
      ])
    )
    provider.queueResponse(endTurnResponse('Here are the search results.'))

    await sendMessage('find information', 'session-clean')

    // Verify session history has clean text (no tool artifacts)
    const sessionId = 'http-http-session-clean'
    const sessionPath = join(dataDir, 'sessions', `${sessionId}.jsonl`)
    const raw = await readFile(sessionPath, 'utf8')
    const entries = raw.trim().split('\n').filter(Boolean).map(l => JSON.parse(l))

    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ role: 'user', content: 'find information' })
    expect(entries[1]).toMatchObject({ role: 'assistant', content: 'Here are the search results.' })

    // No tool_use artifacts in session
    expect(entries[1].content).not.toContain('tool_use')
    expect(entries[1].content).not.toContain('search_web')
  }, 15000)
})

describe('Scenario: Motor System — Tool registration', () => {
  let harness

  afterEach(async () => {
    if (harness) await harness.cleanup()
  })

  it('should pass tool definitions to provider in chat options', async () => {
    harness = await createTestApp()
    const { provider, sendMessage } = harness

    await sendMessage('hello', 'tools-check')

    const lastCall = provider.lastCall
    expect(lastCall.options.tools).toBeDefined()

    // Motor tools always registered (config.motor is always an object)
    expect(lastCall.options.tools.length).toBeGreaterThanOrEqual(2)

    const toolNames = lastCall.options.tools.map(t => t.name)
    expect(toolNames).toContain('search_web')
    expect(toolNames).toContain('fetch_url')
  }, 15000)

  it('should include all 7 tools with motor config', async () => {
    harness = await createTestApp({
      GITHUB_USERNAME: 'testuser'
    })
    const { provider, sendMessage } = harness

    await sendMessage('hello', 'tools-motor')

    const lastCall = provider.lastCall
    expect(lastCall.options.tools).toHaveLength(7)

    const toolNames = lastCall.options.tools.map(t => t.name)
    expect(toolNames).toContain('run_command')
    expect(toolNames).toContain('github_setup_workspace')
  }, 15000)
})

describe('Scenario: Motor System — Background tasks', () => {
  let harness

  afterEach(async () => {
    if (harness) {
      // Allow background TaskRunner to finish before cleanup
      await new Promise(resolve => setTimeout(resolve, 500))
      await harness.cleanup()
    }
  })

  it('should return confirmation immediately when github_setup_workspace triggers background task', async () => {
    harness = await createTestApp()
    const { provider, sendMessage, app } = harness
    const signals = []

    app.bus.on('task:queued', (data) => signals.push({ type: 'queued', ...data }))

    // First response triggers background detection (github_setup_workspace)
    provider.queueResponse(
      toolUseResponse("I'll clone the repo and start working on the fix.", [
        { id: 'tc_bg', name: 'github_setup_workspace', input: { repo: 'owner/repo' } }
      ])
    )

    // Response for TaskRunner after tool execution
    provider.queueResponse(endTurnResponse('The fix has been applied.'))

    const result = await sendMessage('clone owner/repo and fix the bug', 'bg-confirm')

    // HTTP response is the confirmation (returned before task completes)
    expect(result.status).toBe(200)
    expect(result.body.response).toBe("I'll clone the repo and start working on the fix.")

    // task:queued signal should have fired
    expect(signals.some(s => s.type === 'queued')).toBe(true)
  }, 15000)

  it('should cancel active task with cancel command', async () => {
    harness = await createTestApp()
    const { provider, sendMessage, app } = harness

    const cancelSignal = new Promise(resolve => {
      app.bus.on('task:cancelled', (data) => resolve(data))
    })

    // Spawn background task with multiple tool iterations to keep it busy
    provider.queueResponse(
      toolUseResponse('Starting long task.', [
        { id: 'tc_long', name: 'github_setup_workspace', input: { repo: 'owner/big-repo' } }
      ])
    )
    for (let i = 0; i < 5; i++) {
      provider.queueResponse(
        toolUseResponse(`Step ${i + 1}...`, [
          { id: `tc_step_${i}`, name: 'search_web', input: { query: `step ${i}` } }
        ])
      )
    }
    provider.queueResponse(endTurnResponse('Long task done.'))

    // Start the task
    await sendMessage('start big task', 'cancel-test')

    // Send cancel command
    const cancelResult = await sendMessage('cancel', 'cancel-test')

    expect(cancelResult.status).toBe(200)
    expect(cancelResult.body.response).toContain('Task cancelled')

    // task:cancelled signal should fire
    const cancelled = await Promise.race([
      cancelSignal,
      new Promise(resolve => setTimeout(() => resolve(null), 2000))
    ])

    expect(cancelled).not.toBeNull()
  }, 15000)
})

describe('Scenario: Motor System — Memory tags with tool iterations', () => {
  let harness

  afterEach(async () => {
    if (harness) {
      await new Promise(resolve => setTimeout(resolve, 100))
      await harness.cleanup()
    }
  })

  it('should extract memory tags from final response after tool iterations', async () => {
    harness = await createTestApp()
    const { provider, sendMessage, dataDir } = harness

    // Tool iteration first
    provider.queueResponse(
      toolUseResponse('Let me look that up.', [
        { id: 'tc_mem', name: 'search_web', input: { query: 'user preference' } }
      ])
    )

    // Final response includes memory tag
    provider.queueResponse(
      endTurnResponse('You prefer dark mode. <memory>user prefers dark mode</memory>')
    )

    const result = await sendMessage('what theme do I like?', 'mem-tools')

    expect(result.status).toBe(200)
    // Memory tag should be stripped from response
    expect(result.body.response).not.toContain('<memory>')
    expect(result.body.response).toContain('You prefer dark mode.')

    // Memory should be persisted
    const memoryDir = join(dataDir, 'memory')
    const date = new Date().toISOString().slice(0, 10)
    const dailyLog = await readFile(join(memoryDir, `${date}.md`), 'utf8').catch(() => '')
    expect(dailyLog).toContain('user prefers dark mode')
  }, 15000)
})
