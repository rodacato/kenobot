import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), configure: vi.fn() },
  Logger: class { constructor() { this.debug = vi.fn(); this.info = vi.fn(); this.warn = vi.fn(); this.error = vi.fn(); this.configure = vi.fn() } }
}))

vi.mock('grammy', () => ({
  Bot: class { constructor() { this.api = { sendMessage: vi.fn(), sendChatAction: vi.fn(), getMe: vi.fn().mockResolvedValue({ id: 12345, username: 'test_bot' }) } }; on() {}; async start() {}; async stop() {} }
}))

import { createTestApp } from '../../e2e/harness.js'

// Helper: replace tools in registry with fast mocks (avoids real HTTP/git calls)
function mockTools(harness, toolNames = ['search_web', 'fetch_url', 'github_setup_workspace']) {
  const registry = harness.app.agent.toolRegistry
  for (const name of toolNames) {
    if (registry._tools.has(name)) {
      registry._tools.set(name, {
        definition: registry._tools.get(name).definition,
        execute: async (input) => `[mock ${name}] OK`
      })
    }
  }
}

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

describe('Scenario: Motor System — Multi-step inline tool use', () => {
  let harness

  afterEach(async () => {
    if (harness) {
      await new Promise(resolve => setTimeout(resolve, 100))
      await harness.cleanup()
    }
  })

  it('should execute two tool iterations before final response', async () => {
    harness = await createTestApp()
    mockTools(harness)
    const { provider, sendMessage } = harness

    // Iteration 1: search_web
    provider.queueResponse(
      toolUseResponse("I'll search for Node.js streams documentation.", [
        { id: 'tc_1', name: 'search_web', input: { query: 'node.js streams docs' } }
      ])
    )

    // Iteration 2: fetch_url (informed by search results)
    provider.queueResponse(
      toolUseResponse('Found a relevant page, let me fetch it.', [
        { id: 'tc_2', name: 'fetch_url', input: { url: 'https://nodejs.org/api/stream.html' } }
      ])
    )

    // Final response after both tools
    provider.queueResponse(endTurnResponse('Node.js streams allow reading and writing data in chunks.'))

    const result = await sendMessage('find and summarize Node.js stream docs', 'multi-step')

    expect(result.status).toBe(200)
    expect(result.body.response).toBe('Node.js streams allow reading and writing data in chunks.')
  }, 15000)

  it('should preserve clean session history after multi-step tool iterations', async () => {
    harness = await createTestApp()
    mockTools(harness)
    const { provider, sendMessage, dataDir } = harness

    provider.queueResponse(
      toolUseResponse('Searching...', [
        { id: 'tc_1', name: 'search_web', input: { query: 'test' } }
      ])
    )
    provider.queueResponse(
      toolUseResponse('Fetching page...', [
        { id: 'tc_2', name: 'fetch_url', input: { url: 'https://example.com' } }
      ])
    )
    provider.queueResponse(endTurnResponse('Here is the summary.'))

    await sendMessage('research something', 'multi-step-session')

    const sessionId = 'http-http-multi-step-session'
    const sessionPath = join(dataDir, 'sessions', `${sessionId}.jsonl`)
    const raw = await readFile(sessionPath, 'utf8')
    const entries = raw.trim().split('\n').filter(Boolean).map(l => JSON.parse(l))

    // Only user + assistant (no intermediate tool messages)
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ role: 'user', content: 'research something' })
    expect(entries[1]).toMatchObject({ role: 'assistant', content: 'Here is the summary.' })
  }, 15000)

  it('should stop and return response when max iterations reached', async () => {
    harness = await createTestApp({ MAX_TOOL_ITERATIONS: '2' })
    mockTools(harness)
    const { provider, sendMessage } = harness

    // Queue 3 tool_use responses — but limit is 2
    provider.queueResponse(
      toolUseResponse('Step 1...', [
        { id: 'tc_1', name: 'search_web', input: { query: 'step1' } }
      ])
    )
    provider.queueResponse(
      toolUseResponse('Step 2...', [
        { id: 'tc_2', name: 'search_web', input: { query: 'step2' } }
      ])
    )
    // This 3rd response would be the LLM's response after iteration 2
    // Since max is 2, the loop stops and uses this as the final response
    provider.queueResponse(
      toolUseResponse('Step 3 (should be final).', [
        { id: 'tc_3', name: 'search_web', input: { query: 'step3' } }
      ])
    )

    const result = await sendMessage('do lots of steps', 'max-iter')

    expect(result.status).toBe(200)
    // Response should contain the text from the last iteration (step 3 is the response after 2 iterations)
    expect(result.body.response).toContain('Step 3')
  }, 15000)
})

describe('Scenario: Motor System — Background task lifecycle', () => {
  let harness

  afterEach(async () => {
    if (harness) {
      await new Promise(resolve => setTimeout(resolve, 500))
      await harness.cleanup()
    }
  })

  it('should fire TASK_COMPLETED after background task finishes', async () => {
    harness = await createTestApp({ GITHUB_USERNAME: 'testuser' })
    mockTools(harness)
    const { provider, sendMessage, app } = harness

    const completed = new Promise(resolve => {
      app.bus.on('task:completed', (data) => resolve(data))
    })

    // Trigger background task
    provider.queueResponse(
      toolUseResponse('Cloning repository now.', [
        { id: 'tc_bg', name: 'github_setup_workspace', input: { repo: 'owner/repo' } }
      ])
    )
    // After tool execution, LLM returns final response
    provider.queueResponse(endTurnResponse('Repository cloned and ready.'))

    const result = await sendMessage('clone owner/repo', 'bg-complete')

    expect(result.status).toBe(200)
    expect(result.body.response).toBe('Cloning repository now.')

    // Wait for background task to complete
    const completedData = await Promise.race([
      completed,
      new Promise(resolve => setTimeout(() => resolve(null), 5000))
    ])

    expect(completedData).not.toBeNull()
    expect(completedData.text).toBe('Repository cloned and ready.')
  }, 15000)

  it('should fire TASK_FAILED when background task errors', async () => {
    harness = await createTestApp()
    mockTools(harness)
    const { provider, sendMessage, app } = harness

    const failed = new Promise(resolve => {
      app.bus.on('task:failed', (data) => resolve(data))
    })

    // Trigger background task
    provider.queueResponse(
      toolUseResponse('Starting work.', [
        { id: 'tc_bg', name: 'github_setup_workspace', input: { repo: 'owner/repo' } }
      ])
    )

    // After tool execution, TaskRunner calls chatWithRetry.
    // Queue a response whose .content getter throws — accessed in TaskRunner
    // after the while loop exits, causing TASK_FAILED.
    provider.queueResponse({
      get content() { throw new Error('Provider API error') },
      toolCalls: null,
      stopReason: 'end_turn'
    })

    await sendMessage('clone owner/bad-repo', 'bg-fail')

    const failedData = await Promise.race([
      failed,
      new Promise(resolve => setTimeout(() => resolve(null), 5000))
    ])

    expect(failedData).not.toBeNull()
    expect(failedData.error).toContain('Provider API error')
  }, 15000)

  it('should reject second background task when one is already active', async () => {
    harness = await createTestApp()
    const { provider, sendMessage } = harness

    // Replace github_setup_workspace with a SLOW mock to keep task alive
    harness.app.agent.toolRegistry._tools.set('github_setup_workspace', {
      definition: harness.app.agent.toolRegistry._tools.get('github_setup_workspace')?.definition
        || { name: 'github_setup_workspace' },
      execute: async () => {
        await new Promise(resolve => setTimeout(resolve, 2000))
        return 'Workspace ready'
      }
    })
    mockTools(harness, ['search_web', 'fetch_url'])

    // Queue order matters: msg1 consumes [0], msg2 consumes [1], TaskRunner consumes [2]
    provider.queueResponse(
      toolUseResponse('Starting first task.', [
        { id: 'tc_first', name: 'github_setup_workspace', input: { repo: 'owner/repo1' } }
      ])
    )
    provider.queueResponse(
      toolUseResponse('Starting second task.', [
        { id: 'tc_second', name: 'github_setup_workspace', input: { repo: 'owner/repo2' } }
      ])
    )
    provider.queueResponse(endTurnResponse('First task done.'))

    // Start first task (returns confirmation, background TaskRunner starts with 2s tool delay)
    await sendMessage('clone owner/repo1', 'bg-concurrent')

    // Second message arrives while first task's tool is still executing
    const result = await sendMessage('clone owner/repo2', 'bg-concurrent')

    expect(result.status).toBe(200)
    expect(result.body.response).toContain('already a task in progress')
  }, 15000)

  it('should fire TASK_PROGRESS when background task has intermediate text', async () => {
    harness = await createTestApp()
    mockTools(harness)
    const { provider, sendMessage, app } = harness

    const progressMessages = []
    app.bus.on('task:progress', (data) => progressMessages.push(data))

    const completed = new Promise(resolve => {
      app.bus.on('task:completed', (data) => resolve(data))
    })

    // Trigger background task
    provider.queueResponse(
      toolUseResponse('Cloning repo.', [
        { id: 'tc_bg', name: 'github_setup_workspace', input: { repo: 'owner/repo' } }
      ])
    )

    // Tool iteration with text + more tools = progress update
    provider.queueResponse(
      toolUseResponse('Clone complete, now running tests...', [
        { id: 'tc_run', name: 'search_web', input: { query: 'test' } }
      ])
    )

    // Final response
    provider.queueResponse(endTurnResponse('All tests pass.'))

    await sendMessage('clone and test', 'bg-progress')

    await Promise.race([
      completed,
      new Promise(resolve => setTimeout(resolve, 5000))
    ])

    // Should have received progress update with intermediate text
    expect(progressMessages.length).toBeGreaterThanOrEqual(1)
    expect(progressMessages[0].text).toBe('Clone complete, now running tests...')
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
