import { describe, it, expect } from 'vitest'
import { extractUserUpdates } from '../../src/application/extractors/user.js'

describe('extractUserUpdates', () => {
  it('should return original text when no user tags present', () => {
    const { cleanText, updates } = extractUserUpdates('Hello, how are you?')

    expect(cleanText).toBe('Hello, how are you?')
    expect(updates).toEqual([])
  })

  it('should extract a single user tag', () => {
    const input = 'Sure thing!\n\n<user>Preferred language: Spanish</user>'
    const { cleanText, updates } = extractUserUpdates(input)

    expect(cleanText).toBe('Sure thing!')
    expect(updates).toEqual(['Preferred language: Spanish'])
  })

  it('should extract multiple user tags', () => {
    const input = [
      'Got it!',
      '<user>Timezone: America/Mexico_City</user>',
      'Here is the info.',
      '<user>Report format: concise bullet points</user>'
    ].join('\n')

    const { cleanText, updates } = extractUserUpdates(input)

    expect(updates).toHaveLength(2)
    expect(updates[0]).toBe('Timezone: America/Mexico_City')
    expect(updates[1]).toBe('Report format: concise bullet points')
    expect(cleanText).not.toContain('<user>')
  })

  it('should handle multiline user content', () => {
    const input = 'Response.\n<user>Communication preferences:\nPrefers Spanish\nLikes Star Wars refs</user>'
    const { cleanText, updates } = extractUserUpdates(input)

    expect(updates).toEqual(['Communication preferences:\nPrefers Spanish\nLikes Star Wars refs'])
    expect(cleanText).toBe('Response.')
  })

  it('should trim whitespace from extracted updates', () => {
    const input = 'OK.\n<user>  trimmed entry  </user>'
    const { cleanText, updates } = extractUserUpdates(input)

    expect(updates).toEqual(['trimmed entry'])
  })

  it('should skip empty user tags', () => {
    const input = 'Hello.\n<user>  </user>\n<user>real entry</user>'
    const { cleanText, updates } = extractUserUpdates(input)

    expect(updates).toEqual(['real entry'])
  })

  it('should collapse excessive newlines after extraction', () => {
    const input = 'Start.\n\n\n<user>fact</user>\n\n\nEnd.'
    const { cleanText, updates } = extractUserUpdates(input)

    expect(cleanText).toBe('Start.\n\nEnd.')
    expect(updates).toEqual(['fact'])
  })

  it('should handle user tag at start of response', () => {
    const input = '<user>Name: Carlos</user>\nHere is my answer.'
    const { cleanText, updates } = extractUserUpdates(input)

    expect(cleanText).toBe('Here is my answer.')
    expect(updates).toEqual(['Name: Carlos'])
  })

  it('should handle response that is only user tags', () => {
    const input = '<user>fact one</user>\n<user>fact two</user>'
    const { cleanText, updates } = extractUserUpdates(input)

    expect(cleanText).toBe('')
    expect(updates).toEqual(['fact one', 'fact two'])
  })

  it('should not match incomplete tags', () => {
    const input = 'Text with <user>unclosed tag'
    const { cleanText, updates } = extractUserUpdates(input)

    expect(cleanText).toBe('Text with <user>unclosed tag')
    expect(updates).toEqual([])
  })
})
