import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import logger from '../../src/logger.js'
import { runPostProcessors, defaultPostProcessors } from '../../src/agent/post-processors.js'

describe('runPostProcessors', () => {
  it('should run extract and apply for each processor', async () => {
    const processor = {
      name: 'test',
      extract: vi.fn(text => ({ cleanText: text.replace('TAG', ''), data: { found: true } })),
      apply: vi.fn()
    }

    const { cleanText, stats } = await runPostProcessors('hello TAG world', {}, [processor])

    expect(cleanText).toBe('hello  world')
    expect(stats.test).toEqual({ found: true })
    expect(processor.apply).toHaveBeenCalledWith({ found: true }, {})
  })

  it('should chain clean text through processors', async () => {
    const p1 = {
      name: 'first',
      extract: text => ({ cleanText: text.replace('A', ''), data: {} }),
      apply: vi.fn()
    }
    const p2 = {
      name: 'second',
      extract: text => ({ cleanText: text.replace('B', ''), data: {} }),
      apply: vi.fn()
    }

    const { cleanText } = await runPostProcessors('AXB', {}, [p1, p2])

    expect(cleanText).toBe('X')
  })

  it('should continue pipeline when one apply fails', async () => {
    const failing = {
      name: 'failing',
      extract: text => ({ cleanText: text, data: {} }),
      apply: vi.fn().mockRejectedValue(new Error('disk full'))
    }
    const succeeding = {
      name: 'succeeding',
      extract: text => ({ cleanText: text.replace('TAG', ''), data: { ok: true } }),
      apply: vi.fn()
    }

    const { cleanText, stats } = await runPostProcessors('hello TAG', {}, [failing, succeeding])

    expect(cleanText).toBe('hello ')
    expect(succeeding.apply).toHaveBeenCalled()
    expect(stats.succeeding).toEqual({ ok: true })
  })

  it('should log error when apply fails', async () => {
    const failing = {
      name: 'memory',
      extract: text => ({ cleanText: text, data: {} }),
      apply: vi.fn().mockRejectedValue(new Error('write failed'))
    }

    await runPostProcessors('text', {}, [failing])

    expect(logger.error).toHaveBeenCalledWith('post-processor', 'apply_failed', {
      name: 'memory',
      error: 'write failed'
    })
  })

  it('should not affect extraction when apply fails', async () => {
    const failing = {
      name: 'failing',
      extract: text => ({ cleanText: text.replace('<tag>', ''), data: { extracted: true } }),
      apply: vi.fn().mockRejectedValue(new Error('oops'))
    }

    const { cleanText, stats } = await runPostProcessors('hello <tag> world', {}, [failing])

    expect(cleanText).toBe('hello  world')
    expect(stats.failing).toEqual({ extracted: true })
  })
})

describe('working-memory processor', () => {
  const workingMemoryProcessor = defaultPostProcessors.find(p => p.name === 'working-memory')

  it('should exist in the default pipeline', () => {
    expect(workingMemoryProcessor).toBeDefined()
  })

  it('should extract working-memory tags and return clean text', () => {
    const input = 'Answer.\n\n<working-memory>- Current topic</working-memory>'
    const { cleanText, data } = workingMemoryProcessor.extract(input)

    expect(cleanText).toBe('Answer.')
    expect(data.workingMemory).toBe('- Current topic')
  })

  it('should call memory.writeWorkingMemory on apply', async () => {
    const mockMemory = { writeWorkingMemory: vi.fn() }
    const deps = { memory: mockMemory, sessionId: 'telegram-123' }

    await workingMemoryProcessor.apply({ workingMemory: '- Context notes' }, deps)

    expect(mockMemory.writeWorkingMemory).toHaveBeenCalledWith('telegram-123', '- Context notes')
  })

  it('should skip apply when no working memory extracted', async () => {
    const mockMemory = { writeWorkingMemory: vi.fn() }
    const deps = { memory: mockMemory, sessionId: 'telegram-123' }

    await workingMemoryProcessor.apply({ workingMemory: null }, deps)

    expect(mockMemory.writeWorkingMemory).not.toHaveBeenCalled()
  })

  it('should skip apply when no memory manager', async () => {
    const deps = { memory: null, sessionId: 'telegram-123' }

    // Should not throw
    await workingMemoryProcessor.apply({ workingMemory: '- notes' }, deps)
  })

  it('should skip apply when no sessionId', async () => {
    const mockMemory = { writeWorkingMemory: vi.fn() }
    const deps = { memory: mockMemory, sessionId: null }

    await workingMemoryProcessor.apply({ workingMemory: '- notes' }, deps)

    expect(mockMemory.writeWorkingMemory).not.toHaveBeenCalled()
  })
})
