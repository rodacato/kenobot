import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Logger } from '../../src/logger.js'

// Mock node:fs/promises
vi.mock('node:fs/promises', () => ({
  appendFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined)
}))

import { appendFile, mkdir } from 'node:fs/promises'

describe('Logger', () => {
  let logger
  let stdoutSpy
  let stderrSpy

  beforeEach(() => {
    logger = new Logger()
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    vi.clearAllMocks()
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
    stderrSpy.mockRestore()
  })

  describe('console output format', () => {
    it('should format info level to stdout', () => {
      logger.info('telegram', 'message_received', { userId: '123' })

      expect(stdoutSpy).toHaveBeenCalledOnce()
      const output = stdoutSpy.mock.calls[0][0]
      expect(output).toMatch(/^\d{2}:\d{2}:\d{2} \[info\] telegram: message_received userId=123\n$/)
    })

    it('should format warn level to stderr', () => {
      logger.warn('channel', 'auth_rejected', { userId: '999' })

      expect(stderrSpy).toHaveBeenCalledOnce()
      const output = stderrSpy.mock.calls[0][0]
      expect(output).toMatch(/\[warn\] channel: auth_rejected userId=999/)
    })

    it('should format error level to stderr', () => {
      logger.error('claude-cli', 'request_failed', { error: 'timeout' })

      expect(stderrSpy).toHaveBeenCalledOnce()
      const output = stderrSpy.mock.calls[0][0]
      expect(output).toMatch(/\[error\] claude-cli: request_failed error=timeout/)
    })

    it('should handle empty data object', () => {
      logger.info('system', 'startup')

      const output = stdoutSpy.mock.calls[0][0]
      expect(output).toMatch(/\[info\] system: startup\n$/)
      // No trailing space or key=value
      expect(output).not.toMatch(/startup /)
    })

    it('should format multiple data fields as key=value pairs', () => {
      logger.info('telegram', 'message_received', { userId: '123', chatId: '456', length: 42 })

      const output = stdoutSpy.mock.calls[0][0]
      expect(output).toContain('userId=123')
      expect(output).toContain('chatId=456')
      expect(output).toContain('length=42')
    })
  })

  describe('JSONL entry structure', () => {
    it('should produce valid JSON with required fields', () => {
      logger.configure({ dataDir: '/tmp/test-logs' })

      // Wait for mkdir to resolve
      return new Promise((resolve) => setTimeout(resolve, 10)).then(async () => {
        logger.info('telegram', 'test_event', { key: 'value' })

        // Wait for async file write
        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(appendFile).toHaveBeenCalled()
        const written = appendFile.mock.calls[0][1]
        const entry = JSON.parse(written.trim())

        expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/)
        expect(entry.level).toBe('info')
        expect(entry.subsystem).toBe('telegram')
        expect(entry.event).toBe('test_event')
        expect(entry.data).toEqual({ key: 'value' })
      })
    })

    it('should omit data field when empty', () => {
      logger.configure({ dataDir: '/tmp/test-logs' })

      return new Promise((resolve) => setTimeout(resolve, 10)).then(async () => {
        logger.info('system', 'startup')

        await new Promise((resolve) => setTimeout(resolve, 10))

        const written = appendFile.mock.calls[0][1]
        const entry = JSON.parse(written.trim())

        expect(entry).not.toHaveProperty('data')
      })
    })
  })

  describe('file writing', () => {
    it('should write to date-stamped file', () => {
      logger.configure({ dataDir: '/tmp/test-logs' })

      return new Promise((resolve) => setTimeout(resolve, 10)).then(async () => {
        logger.info('system', 'test')

        await new Promise((resolve) => setTimeout(resolve, 10))

        const filepath = appendFile.mock.calls[0][0]
        expect(filepath).toMatch(/kenobot-\d{4}-\d{2}-\d{2}\.log$/)
      })
    })

    it('should create log directory on configure', () => {
      logger.configure({ dataDir: '/tmp/test-logs' })

      return new Promise((resolve) => setTimeout(resolve, 10)).then(() => {
        expect(mkdir).toHaveBeenCalledWith(
          expect.stringContaining('logs'),
          { recursive: true }
        )
      })
    })

    it('should handle file write errors without throwing', () => {
      appendFile.mockRejectedValueOnce(new Error('disk full'))
      logger.configure({ dataDir: '/tmp/test-logs' })

      return new Promise((resolve) => setTimeout(resolve, 10)).then(async () => {
        // Should not throw
        logger.info('system', 'test')
        await new Promise((resolve) => setTimeout(resolve, 10))

        // Should have logged error to stderr
        const stderrCalls = stderrSpy.mock.calls.map(c => c[0])
        const hasFileError = stderrCalls.some(c => c.includes('Logger file write failed'))
        expect(hasFileError).toBe(true)
      })
    })
  })

  describe('buffering before configure', () => {
    it('should buffer entries before configure() is called', () => {
      logger.info('system', 'early_event')

      // Console output should work
      expect(stdoutSpy).toHaveBeenCalledOnce()
      // But no file write yet
      expect(appendFile).not.toHaveBeenCalled()
    })

    it('should flush buffered entries after configure()', () => {
      logger.info('system', 'event_one')
      logger.warn('system', 'event_two')

      expect(appendFile).not.toHaveBeenCalled()

      logger.configure({ dataDir: '/tmp/test-logs' })

      return new Promise((resolve) => setTimeout(resolve, 10)).then(() => {
        // Both buffered entries should have been flushed
        expect(appendFile).toHaveBeenCalledTimes(2)
      })
    })

    it('should still write to console before configure()', () => {
      logger.info('system', 'before_config')

      expect(stdoutSpy).toHaveBeenCalledOnce()
      expect(stdoutSpy.mock.calls[0][0]).toContain('before_config')
    })
  })
})
