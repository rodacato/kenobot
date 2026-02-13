import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import ErrorAnalyzer from '../../../src/cognitive/consolidation/error-analyzer.js'

describe('ErrorAnalyzer', () => {
  let errorAnalyzer
  let mockMemory

  beforeEach(() => {
    mockMemory = {}
    errorAnalyzer = new ErrorAnalyzer(mockMemory)
    vi.clearAllMocks()
  })

  describe('run', () => {
    it('should return error analysis results', async () => {
      const result = await errorAnalyzer.run()

      expect(result).toHaveProperty('errorsFound')
      expect(result).toHaveProperty('lessonsExtracted')
    })
  })

  describe('classifyError', () => {
    it('should classify network errors as external', () => {
      const category = errorAnalyzer.classifyError('Network timeout occurred')

      expect(category).toBe('external')
    })

    it('should classify connection errors as external', () => {
      const category = errorAnalyzer.classifyError('ECONNREFUSED: connection refused')

      expect(category).toBe('external')
    })

    it('should classify config errors as configuration', () => {
      const category = errorAnalyzer.classifyError('Missing API_KEY configuration')

      expect(category).toBe('configuration')
    })

    it('should classify undefined errors as configuration', () => {
      const category = errorAnalyzer.classifyError('Cannot read property of undefined')

      expect(category).toBe('configuration')
    })

    it('should classify invalid input as user error', () => {
      const category = errorAnalyzer.classifyError('Invalid parameter provided')

      expect(category).toBe('user')
    })

    it('should classify unknown errors as internal', () => {
      const category = errorAnalyzer.classifyError('Something went wrong')

      expect(category).toBe('internal')
    })
  })

  describe('extractLesson', () => {
    it('should return null for placeholder', () => {
      const lesson = errorAnalyzer.extractLesson('Error message', 'context')

      expect(lesson).toBeNull()
    })
  })

  describe('isRecoverable', () => {
    it('should mark timeout errors as recoverable', () => {
      const recoverable = errorAnalyzer.isRecoverable('Request timeout')

      expect(recoverable).toBe(true)
    })

    it('should mark temporary errors as recoverable', () => {
      const recoverable = errorAnalyzer.isRecoverable('Temporary failure')

      expect(recoverable).toBe(true)
    })

    it('should mark fatal errors as not recoverable', () => {
      const recoverable = errorAnalyzer.isRecoverable('Fatal error occurred')

      expect(recoverable).toBe(false)
    })

    it('should default to recoverable for unknown errors', () => {
      const recoverable = errorAnalyzer.isRecoverable('Unknown issue')

      expect(recoverable).toBe(true)
    })
  })
})
