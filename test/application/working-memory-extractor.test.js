import { describe, it, expect } from 'vitest'
import { extractWorkingMemory } from '../../src/application/extractors/working-memory.js'

describe('extractWorkingMemory', () => {
  it('should return null when no working-memory tags present', () => {
    const { cleanText, workingMemory } = extractWorkingMemory('Hello, how are you?')

    expect(cleanText).toBe('Hello, how are you?')
    expect(workingMemory).toBeNull()
  })

  it('should extract a single working-memory tag', () => {
    const input = 'Sure thing!\n\n<working-memory>- Discussing AI regulation</working-memory>'
    const { cleanText, workingMemory } = extractWorkingMemory(input)

    expect(cleanText).toBe('Sure thing!')
    expect(workingMemory).toBe('- Discussing AI regulation')
  })

  it('should keep only the last tag when multiple are present', () => {
    const input = [
      'First part.',
      '<working-memory>- Old context</working-memory>',
      'Second part.',
      '<working-memory>- Updated context\n- New topic added</working-memory>'
    ].join('\n')

    const { cleanText, workingMemory } = extractWorkingMemory(input)

    expect(workingMemory).toBe('- Updated context\n- New topic added')
    expect(cleanText).not.toContain('<working-memory>')
  })

  it('should handle multiline content', () => {
    const input = 'Response.\n<working-memory>- Topic: EU AI Act\n- Covered: risk classification\n- Pending: sanctions</working-memory>'
    const { cleanText, workingMemory } = extractWorkingMemory(input)

    expect(workingMemory).toBe('- Topic: EU AI Act\n- Covered: risk classification\n- Pending: sanctions')
    expect(cleanText).toBe('Response.')
  })

  it('should trim whitespace from extracted content', () => {
    const input = 'OK.\n<working-memory>  trimmed content  </working-memory>'
    const { cleanText, workingMemory } = extractWorkingMemory(input)

    expect(workingMemory).toBe('trimmed content')
  })

  it('should return null for empty tags', () => {
    const input = 'Hello.\n<working-memory>  </working-memory>'
    const { cleanText, workingMemory } = extractWorkingMemory(input)

    expect(workingMemory).toBeNull()
  })

  it('should collapse excessive newlines after extraction', () => {
    const input = 'Start.\n\n\n<working-memory>- context</working-memory>\n\n\nEnd.'
    const { cleanText, workingMemory } = extractWorkingMemory(input)

    expect(cleanText).toBe('Start.\n\nEnd.')
    expect(workingMemory).toBe('- context')
  })

  it('should handle tag at start of response', () => {
    const input = '<working-memory>- current task</working-memory>\nHere is my answer.'
    const { cleanText, workingMemory } = extractWorkingMemory(input)

    expect(cleanText).toBe('Here is my answer.')
    expect(workingMemory).toBe('- current task')
  })

  it('should handle response that is only a working-memory tag', () => {
    const input = '<working-memory>- only context</working-memory>'
    const { cleanText, workingMemory } = extractWorkingMemory(input)

    expect(cleanText).toBe('')
    expect(workingMemory).toBe('- only context')
  })

  it('should not match incomplete tags', () => {
    const input = 'Text with <working-memory>unclosed tag'
    const { cleanText, workingMemory } = extractWorkingMemory(input)

    expect(cleanText).toBe('Text with <working-memory>unclosed tag')
    expect(workingMemory).toBeNull()
  })

  it('should ignore empty tag when followed by non-empty tag', () => {
    const input = '<working-memory>  </working-memory>\n<working-memory>- real content</working-memory>'
    const { cleanText, workingMemory } = extractWorkingMemory(input)

    expect(workingMemory).toBe('- real content')
  })
})
