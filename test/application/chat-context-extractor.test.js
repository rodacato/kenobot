import { describe, it, expect } from 'vitest'
import { extractChatContext } from '../../src/application/extractors/chat-context.js'

describe('extractChatContext', () => {
  it('should return null when no chat-context tags present', () => {
    const { cleanText, chatContext } = extractChatContext('Hello, how are you?')

    expect(cleanText).toBe('Hello, how are you?')
    expect(chatContext).toBeNull()
  })

  it('should extract a single chat-context tag', () => {
    const input = 'Got it!\n\n<chat-context>Type: Work group\nTone: Professional</chat-context>'
    const { cleanText, chatContext } = extractChatContext(input)

    expect(cleanText).toBe('Got it!')
    expect(chatContext).toBe('Type: Work group\nTone: Professional')
  })

  it('should keep only the last tag when multiple are present', () => {
    const input = [
      'First part.',
      '<chat-context>Type: Friends</chat-context>',
      'Second part.',
      '<chat-context>Type: Work group\nTone: Professional</chat-context>'
    ].join('\n')

    const { cleanText, chatContext } = extractChatContext(input)

    expect(chatContext).toBe('Type: Work group\nTone: Professional')
    expect(cleanText).not.toContain('<chat-context>')
  })

  it('should handle multiline content', () => {
    const input = 'Response.\n<chat-context>Type: Family group\nTone: Casual, warm\nTopics: Weekend plans, health\nMembers: Mom, Dad, Sister</chat-context>'
    const { cleanText, chatContext } = extractChatContext(input)

    expect(chatContext).toBe('Type: Family group\nTone: Casual, warm\nTopics: Weekend plans, health\nMembers: Mom, Dad, Sister')
    expect(cleanText).toBe('Response.')
  })

  it('should trim whitespace from extracted content', () => {
    const input = 'OK.\n<chat-context>  Type: Work group  </chat-context>'
    const { cleanText, chatContext } = extractChatContext(input)

    expect(chatContext).toBe('Type: Work group')
  })

  it('should return null for empty tags', () => {
    const input = 'Hello.\n<chat-context>  </chat-context>'
    const { cleanText, chatContext } = extractChatContext(input)

    expect(chatContext).toBeNull()
  })

  it('should collapse excessive newlines after extraction', () => {
    const input = 'Start.\n\n\n<chat-context>Type: Work</chat-context>\n\n\nEnd.'
    const { cleanText, chatContext } = extractChatContext(input)

    expect(cleanText).toBe('Start.\n\nEnd.')
    expect(chatContext).toBe('Type: Work')
  })

  it('should handle tag at start of response', () => {
    const input = '<chat-context>Type: Friends</chat-context>\nHere is my answer.'
    const { cleanText, chatContext } = extractChatContext(input)

    expect(cleanText).toBe('Here is my answer.')
    expect(chatContext).toBe('Type: Friends')
  })

  it('should handle response that is only a chat-context tag', () => {
    const input = '<chat-context>Type: Work group</chat-context>'
    const { cleanText, chatContext } = extractChatContext(input)

    expect(cleanText).toBe('')
    expect(chatContext).toBe('Type: Work group')
  })

  it('should not match incomplete tags', () => {
    const input = 'Text with <chat-context>unclosed tag'
    const { cleanText, chatContext } = extractChatContext(input)

    expect(cleanText).toBe('Text with <chat-context>unclosed tag')
    expect(chatContext).toBeNull()
  })

  it('should ignore empty tag when followed by non-empty tag', () => {
    const input = '<chat-context>  </chat-context>\n<chat-context>Type: Family</chat-context>'
    const { cleanText, chatContext } = extractChatContext(input)

    expect(chatContext).toBe('Type: Family')
  })
})
