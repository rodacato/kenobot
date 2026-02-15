import { describe, it, expect } from 'vitest'
import { extractBootstrapComplete } from '../../src/application/extractors/bootstrap.js'

describe('extractBootstrapComplete', () => {
  it('should return false when no tag present', () => {
    const { cleanText, isComplete } = extractBootstrapComplete('Hello, nice to meet you!')

    expect(cleanText).toBe('Hello, nice to meet you!')
    expect(isComplete).toBe(false)
  })

  it('should detect self-closing tag', () => {
    const input = 'Great talking to you!\n\n<bootstrap-complete/>'
    const { cleanText, isComplete } = extractBootstrapComplete(input)

    expect(isComplete).toBe(true)
    expect(cleanText).toBe('Great talking to you!')
  })

  it('should detect tag with space before slash', () => {
    const input = 'All set!\n<bootstrap-complete />'
    const { cleanText, isComplete } = extractBootstrapComplete(input)

    expect(isComplete).toBe(true)
    expect(cleanText).toBe('All set!')
  })

  it('should detect tag without self-closing slash', () => {
    const input = 'Done!\n<bootstrap-complete>'
    const { cleanText, isComplete } = extractBootstrapComplete(input)

    expect(isComplete).toBe(true)
    expect(cleanText).toBe('Done!')
  })

  it('should handle tag in the middle of text', () => {
    const input = 'I updated your files.\n<bootstrap-complete/>\nEnjoy!'
    const { cleanText, isComplete } = extractBootstrapComplete(input)

    expect(isComplete).toBe(true)
    expect(cleanText).toBe('I updated your files.\n\nEnjoy!')
  })

  it('should collapse excessive newlines after removal', () => {
    const input = 'Start.\n\n\n<bootstrap-complete/>\n\n\nEnd.'
    const { cleanText, isComplete } = extractBootstrapComplete(input)

    expect(isComplete).toBe(true)
    expect(cleanText).toBe('Start.\n\nEnd.')
  })

  it('should handle response that is only the tag', () => {
    const { cleanText, isComplete } = extractBootstrapComplete('<bootstrap-complete/>')

    expect(isComplete).toBe(true)
    expect(cleanText).toBe('')
  })
})
