import { describe, it, expect } from 'vitest'
import { extractMemories } from '../../src/agent/memory-extractor.js'

describe('extractMemories', () => {
  it('should return original text when no memory tags present', () => {
    const { cleanText, memories } = extractMemories('Hello, how are you?')

    expect(cleanText).toBe('Hello, how are you?')
    expect(memories).toEqual([])
  })

  it('should extract a single memory tag', () => {
    const input = 'Sure thing!\n\n<memory>User prefers Spanish</memory>'
    const { cleanText, memories } = extractMemories(input)

    expect(cleanText).toBe('Sure thing!')
    expect(memories).toEqual(['User prefers Spanish'])
  })

  it('should extract multiple memory tags', () => {
    const input = [
      'Got it!',
      '<memory>User likes concise answers</memory>',
      'Here is the info.',
      '<memory>User works on KenoBot project</memory>'
    ].join('\n')

    const { cleanText, memories } = extractMemories(input)

    expect(memories).toHaveLength(2)
    expect(memories[0]).toBe('User likes concise answers')
    expect(memories[1]).toBe('User works on KenoBot project')
    expect(cleanText).not.toContain('<memory>')
  })

  it('should handle multiline memory content', () => {
    const input = 'Response.\n<memory>Project context:\nKenoBot Phase 2\nMemory system</memory>'
    const { cleanText, memories } = extractMemories(input)

    expect(memories).toEqual(['Project context:\nKenoBot Phase 2\nMemory system'])
    expect(cleanText).toBe('Response.')
  })

  it('should trim whitespace from extracted memories', () => {
    const input = 'OK.\n<memory>  trimmed entry  </memory>'
    const { cleanText, memories } = extractMemories(input)

    expect(memories).toEqual(['trimmed entry'])
  })

  it('should skip empty memory tags', () => {
    const input = 'Hello.\n<memory>  </memory>\n<memory>real entry</memory>'
    const { cleanText, memories } = extractMemories(input)

    expect(memories).toEqual(['real entry'])
  })

  it('should collapse excessive newlines after extraction', () => {
    const input = 'Start.\n\n\n<memory>fact</memory>\n\n\nEnd.'
    const { cleanText, memories } = extractMemories(input)

    expect(cleanText).toBe('Start.\n\nEnd.')
    expect(memories).toEqual(['fact'])
  })

  it('should handle memory tag at start of response', () => {
    const input = '<memory>important fact</memory>\nHere is my answer.'
    const { cleanText, memories } = extractMemories(input)

    expect(cleanText).toBe('Here is my answer.')
    expect(memories).toEqual(['important fact'])
  })

  it('should handle response that is only memory tags', () => {
    const input = '<memory>fact one</memory>\n<memory>fact two</memory>'
    const { cleanText, memories } = extractMemories(input)

    expect(cleanText).toBe('')
    expect(memories).toEqual(['fact one', 'fact two'])
  })

  it('should not match incomplete tags', () => {
    const input = 'Text with <memory>unclosed tag'
    const { cleanText, memories } = extractMemories(input)

    expect(cleanText).toBe('Text with <memory>unclosed tag')
    expect(memories).toEqual([])
  })
})
