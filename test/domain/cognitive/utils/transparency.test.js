import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../../src/infrastructure/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import TransparencyManager from '../../../../src/domain/cognitive/utils/transparency.js'

describe('TransparencyManager', () => {
  let transparency

  beforeEach(() => {
    transparency = new TransparencyManager()
    vi.clearAllMocks()
  })

  describe('generateLearningFeedback', () => {
    it('should generate fact feedback in Spanish', () => {
      const feedback = transparency.generateLearningFeedback('fact', 'Adrian prefers Spanish', 'es')

      expect(feedback).toContain('✓')
      expect(feedback).toContain('He aprendido que')
      expect(feedback).toContain('Adrian prefers Spanish')
    })

    it('should generate preference feedback in Spanish', () => {
      const feedback = transparency.generateLearningFeedback('preference', 'Uses vim', 'es')

      expect(feedback).toContain('✓')
      expect(feedback).toContain('He guardado tu preferencia')
      expect(feedback).toContain('Uses vim')
    })

    it('should generate pattern feedback in Spanish', () => {
      const feedback = transparency.generateLearningFeedback('pattern', 'n8n auth pattern', 'es')

      expect(feedback).toContain('✓')
      expect(feedback).toContain('He identificado un patrón')
    })

    it('should generate error feedback in Spanish', () => {
      const feedback = transparency.generateLearningFeedback('error', 'Check token param first', 'es')

      expect(feedback).toContain('✓')
      expect(feedback).toContain('He aprendido de este error')
    })

    it('should generate feedback in English', () => {
      const feedback = transparency.generateLearningFeedback('fact', 'Test fact', 'en')

      expect(feedback).toContain('I learned that')
      expect(feedback).toContain('Test fact')
    })

    it('should default to Spanish for unknown language', () => {
      const feedback = transparency.generateLearningFeedback('fact', 'Test', 'fr')

      expect(feedback).toContain('He aprendido que')
    })
  })

  describe('recordResponse and explainLastResponse', () => {
    it('should record response context', () => {
      transparency.recordResponse('session-1', {
        response: 'Test response',
        sources: ['source1', 'source2'],
        reasoning: 'Test reasoning',
        memoryUsed: ['semantic', 'episodic']
      })

      const explanation = transparency.explainLastResponse('session-1', 'es')

      expect(explanation).toContain('Explicación de mi última respuesta')
      expect(explanation).toContain('Memoria utilizada')
      expect(explanation).toContain('semantic')
      expect(explanation).toContain('episodic')
      expect(explanation).toContain('Fuentes consultadas')
      expect(explanation).toContain('source1')
      expect(explanation).toContain('source2')
      expect(explanation).toContain('Razonamiento')
      expect(explanation).toContain('Test reasoning')
    })

    it('should return null for no recorded response', () => {
      const explanation = transparency.explainLastResponse('session-2', 'es')

      expect(explanation).toContain('No tengo registro')
    })

    it('should generate explanation in English', () => {
      transparency.recordResponse('session-1', {
        response: 'Test',
        sources: ['source1']
      })

      const explanation = transparency.explainLastResponse('session-1', 'en')

      expect(explanation).toContain('Explanation of my last response')
      expect(explanation).toContain('Sources consulted')
    })

    it('should handle response without sources', () => {
      transparency.recordResponse('session-1', {
        response: 'Test',
        sources: []
      })

      const explanation = transparency.explainLastResponse('session-1', 'es')

      expect(explanation).not.toContain('Fuentes consultadas')
    })
  })

  describe('generateMemoryStatus', () => {
    it('should generate complete status report in Spanish', () => {
      const stats = {
        working: { active: 5, stale: 2 },
        semantic: { facts: 100, procedures: 20 },
        episodic: { total: 150, chatSpecific: 30 },
        procedural: { patterns: 10 },
        sleepCycle: { lastRun: Date.now() - 3600000 } // 1 hour ago
      }

      const report = transparency.generateMemoryStatus(stats, 'es')

      expect(report).toContain('Estado de la Memoria')
      expect(report).toContain('Memoria de Trabajo')
      expect(report).toContain('5 activas')
      expect(report).toContain('2 obsoletas')
      expect(report).toContain('Memoria Semántica')
      expect(report).toContain('100 hechos')
      expect(report).toContain('20 procedimientos')
      expect(report).toContain('Memoria Episódica')
      expect(report).toContain('150 episodios')
      expect(report).toContain('30 de este chat')
      expect(report).toContain('Memoria Procedimental')
      expect(report).toContain('10 patrones aprendidos')
      expect(report).toContain('Último Ciclo de Sueño')
    })

    it('should generate status in English', () => {
      const stats = {
        working: { active: 5, stale: 0 },
        semantic: { facts: 100 }
      }

      const report = transparency.generateMemoryStatus(stats, 'en')

      expect(report).toContain('Memory Status')
      expect(report).toContain('Working Memory')
      expect(report).toContain('5 active')
      expect(report).toContain('Semantic Memory')
      expect(report).toContain('100 facts')
    })

    it('should handle minimal stats', () => {
      const stats = {
        working: { active: 0, stale: 0 }
      }

      const report = transparency.generateMemoryStatus(stats, 'es')

      expect(report).toContain('Estado de la Memoria')
      expect(report).toContain('0 activas')
    })
  })

  describe('formatTimeAgo', () => {
    it('should format seconds in Spanish', () => {
      const formatted = transparency.formatTimeAgo(5000, 'es')

      expect(formatted).toBe('5 segundos')
    })

    it('should format minutes in Spanish', () => {
      const formatted = transparency.formatTimeAgo(120000, 'es')

      expect(formatted).toBe('2 minutos')
    })

    it('should format hours in Spanish', () => {
      const formatted = transparency.formatTimeAgo(3600000, 'es')

      expect(formatted).toBe('1 hora')
    })

    it('should format days in Spanish', () => {
      const formatted = transparency.formatTimeAgo(86400000 * 3, 'es')

      expect(formatted).toBe('3 días')
    })

    it('should format in English', () => {
      const formatted = transparency.formatTimeAgo(120000, 'en')

      expect(formatted).toBe('2 minutes')
    })

    it('should handle singular forms', () => {
      expect(transparency.formatTimeAgo(1000, 'es')).toBe('1 segundo')
      expect(transparency.formatTimeAgo(60000, 'es')).toBe('1 minuto')
      expect(transparency.formatTimeAgo(3600000, 'es')).toBe('1 hora')
      expect(transparency.formatTimeAgo(86400000, 'es')).toBe('1 día')
    })
  })
})
