import { describe, it, expect } from 'vitest'
import { extractChatMemories } from '../../src/application/extractors/chat-memory.js'

describe('extractChatMemories', () => {
  it('should return original text when no chat-memory tags present', () => {
    const { cleanText, chatMemories } = extractChatMemories('Hello, how are you?')

    expect(cleanText).toBe('Hello, how are you?')
    expect(chatMemories).toEqual([])
  })

  it('should extract a single chat-memory tag', () => {
    const input = 'Sure thing!\n\n<chat-memory>Family lives in Madrid</chat-memory>'
    const { cleanText, chatMemories } = extractChatMemories(input)

    expect(cleanText).toBe('Sure thing!')
    expect(chatMemories).toEqual(['Family lives in Madrid'])
  })

  it('should extract multiple chat-memory tags', () => {
    const input = [
      'Got it!',
      '<chat-memory>Project uses Python</chat-memory>',
      'Here is the info.',
      '<chat-memory>Deploy target is AWS</chat-memory>'
    ].join('\n')

    const { cleanText, chatMemories } = extractChatMemories(input)

    expect(chatMemories).toHaveLength(2)
    expect(chatMemories[0]).toBe('Project uses Python')
    expect(chatMemories[1]).toBe('Deploy target is AWS')
    expect(cleanText).not.toContain('<chat-memory>')
  })

  it('should handle multiline chat-memory content', () => {
    const input = 'Response.\n<chat-memory>Group context:\nFamily chat\nMadrid timezone</chat-memory>'
    const { cleanText, chatMemories } = extractChatMemories(input)

    expect(chatMemories).toEqual(['Group context:\nFamily chat\nMadrid timezone'])
    expect(cleanText).toBe('Response.')
  })

  it('should trim whitespace from extracted chat memories', () => {
    const input = 'OK.\n<chat-memory>  trimmed entry  </chat-memory>'
    const { cleanText, chatMemories } = extractChatMemories(input)

    expect(chatMemories).toEqual(['trimmed entry'])
  })

  it('should skip empty chat-memory tags', () => {
    const input = 'Hello.\n<chat-memory>  </chat-memory>\n<chat-memory>real entry</chat-memory>'
    const { cleanText, chatMemories } = extractChatMemories(input)

    expect(chatMemories).toEqual(['real entry'])
  })

  it('should collapse excessive newlines after extraction', () => {
    const input = 'Start.\n\n\n<chat-memory>fact</chat-memory>\n\n\nEnd.'
    const { cleanText, chatMemories } = extractChatMemories(input)

    expect(cleanText).toBe('Start.\n\nEnd.')
    expect(chatMemories).toEqual(['fact'])
  })

  it('should not match incomplete tags', () => {
    const input = 'Text with <chat-memory>unclosed tag'
    const { cleanText, chatMemories } = extractChatMemories(input)

    expect(cleanText).toBe('Text with <chat-memory>unclosed tag')
    expect(chatMemories).toEqual([])
  })

  it('should not interfere with regular <memory> tags', () => {
    const input = 'Response.\n<memory>global fact</memory>\n<chat-memory>chat fact</chat-memory>'
    const { cleanText, chatMemories } = extractChatMemories(input)

    expect(chatMemories).toEqual(['chat fact'])
    // <memory> tags should remain untouched
    expect(cleanText).toContain('<memory>global fact</memory>')
  })

  it('should handle response that is only chat-memory tags', () => {
    const input = '<chat-memory>fact one</chat-memory>\n<chat-memory>fact two</chat-memory>'
    const { cleanText, chatMemories } = extractChatMemories(input)

    expect(cleanText).toBe('')
    expect(chatMemories).toEqual(['fact one', 'fact two'])
  })
})
