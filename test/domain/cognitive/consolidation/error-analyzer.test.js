import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../../src/infrastructure/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import ErrorAnalyzer from '../../../../src/domain/cognitive/consolidation/error-analyzer.js'

describe('ErrorAnalyzer', () => {
  let errorAnalyzer
  let mockMemory

  beforeEach(() => {
    mockMemory = {
      getRecentDays: vi.fn().mockResolvedValue(''),
      addFact: vi.fn().mockResolvedValue(undefined)
    }
    errorAnalyzer = new ErrorAnalyzer(mockMemory)
    vi.clearAllMocks()
  })

  describe('run', () => {
    it('should return error analysis results', async () => {
      const result = await errorAnalyzer.run()

      expect(result).toHaveProperty('errorsFound')
      expect(result).toHaveProperty('lessonsExtracted')
    })

    it('should return zeros when no episodes exist', async () => {
      const result = await errorAnalyzer.run()

      expect(result.errorsFound).toBe(0)
      expect(result.lessonsExtracted).toBe(0)
    })

    it('should find errors in episode text', async () => {
      mockMemory.getRecentDays.mockResolvedValue(
        '## 10:00 — An internal error occurred in processing pipeline\n\n' +
        '## 11:00 — Regular conversation about weather'
      )

      const result = await errorAnalyzer.run()

      expect(result.errorsFound).toBe(1)
    })

    it('should extract lessons from internal errors', async () => {
      mockMemory.getRecentDays.mockResolvedValue(
        '## 10:00 — An internal error occurred: memory allocation failed during batch processing'
      )

      const result = await errorAnalyzer.run()

      expect(result.errorsFound).toBe(1)
      expect(result.lessonsExtracted).toBe(1)
      expect(mockMemory.addFact).toHaveBeenCalled()
    })

    it('should extract lessons from configuration errors', async () => {
      mockMemory.getRecentDays.mockResolvedValue(
        '## 10:00 — Config error: missing API_KEY in configuration settings'
      )

      const result = await errorAnalyzer.run()

      expect(result.lessonsExtracted).toBe(1)
    })

    it('should not extract lessons from external errors', async () => {
      mockMemory.getRecentDays.mockResolvedValue(
        '## 10:00 — Network timeout error while connecting to external API'
      )

      const result = await errorAnalyzer.run()

      expect(result.errorsFound).toBe(1)
      expect(result.lessonsExtracted).toBe(0)
    })
  })

  describe('classifyError', () => {
    it('should classify network errors as external', () => {
      expect(errorAnalyzer.classifyError('Network timeout occurred')).toBe('external')
    })

    it('should classify connection errors as external', () => {
      expect(errorAnalyzer.classifyError('ECONNREFUSED: connection refused')).toBe('external')
    })

    it('should classify config errors as configuration', () => {
      expect(errorAnalyzer.classifyError('Missing API_KEY configuration')).toBe('configuration')
    })

    it('should classify undefined errors as configuration', () => {
      expect(errorAnalyzer.classifyError('Cannot read property of undefined')).toBe('configuration')
    })

    it('should classify invalid input as user error', () => {
      expect(errorAnalyzer.classifyError('Invalid parameter provided')).toBe('user')
    })

    it('should classify unknown errors as internal', () => {
      expect(errorAnalyzer.classifyError('Something went wrong')).toBe('internal')
    })
  })

  describe('extractLesson', () => {
    it('should extract lesson from error entry', () => {
      const lesson = errorAnalyzer.extractLesson(
        '## 10:00 — An error occurred in the memory system during consolidation phase',
        'internal'
      )

      expect(lesson).toBeTruthy()
      expect(lesson).toContain('Error encountered')
      expect(lesson).toContain('learned')
    })

    it('should format configuration lessons differently', () => {
      const lesson = errorAnalyzer.extractLesson(
        '## 10:00 — Config error: missing DATABASE_URL in configuration',
        'configuration'
      )

      expect(lesson).toContain('Configuration issue')
    })

    it('should return null when no error line found', () => {
      const lesson = errorAnalyzer.extractLesson(
        'Just a regular message with no issues',
        'internal'
      )

      expect(lesson).toBeNull()
    })

    it('should strip timestamp prefix from lesson', () => {
      const lesson = errorAnalyzer.extractLesson(
        '## 10:00 — Critical error in the processing pipeline',
        'internal'
      )

      expect(lesson).not.toMatch(/^## \d{2}:\d{2}/)
    })
  })

  describe('isRecoverable', () => {
    it('should mark timeout errors as recoverable', () => {
      expect(errorAnalyzer.isRecoverable('Request timeout')).toBe(true)
    })

    it('should mark temporary errors as recoverable', () => {
      expect(errorAnalyzer.isRecoverable('Temporary failure')).toBe(true)
    })

    it('should mark fatal errors as not recoverable', () => {
      expect(errorAnalyzer.isRecoverable('Fatal error occurred')).toBe(false)
    })

    it('should default to recoverable for unknown errors', () => {
      expect(errorAnalyzer.isRecoverable('Unknown issue')).toBe(true)
    })
  })
})
