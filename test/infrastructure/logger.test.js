import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Logger } from '../../src/infrastructure/logger.js'

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

  describe('debug level', () => {
    it('should output debug to stdout when logLevel is debug', () => {
      logger.configure({ dataDir: '/tmp/test-logs', logLevel: 'debug' })

      return new Promise((resolve) => setTimeout(resolve, 10)).then(() => {
        logger.debug('system', 'some_detail', { key: 'val' })

        const calls = stdoutSpy.mock.calls.map(c => c[0])
        const hasDebug = calls.some(c => c.includes('[debug] system: some_detail'))
        expect(hasDebug).toBe(true)
      })
    })

    it('should suppress debug on console when logLevel is info (default)', () => {
      logger.debug('system', 'some_detail')

      expect(stdoutSpy).not.toHaveBeenCalled()
      expect(stderrSpy).not.toHaveBeenCalled()
    })

    it('should always write debug to JSONL file regardless of level', () => {
      logger.configure({ dataDir: '/tmp/test-logs' }) // default: info

      return new Promise((resolve) => setTimeout(resolve, 10)).then(async () => {
        logger.debug('system', 'file_only', { key: 'val' })

        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(appendFile).toHaveBeenCalled()
        const written = appendFile.mock.calls[0][1]
        const entry = JSON.parse(written.trim())
        expect(entry.level).toBe('debug')
        expect(entry.subsystem).toBe('system')
        expect(entry.event).toBe('file_only')
      })
    })
  })

  describe('value filtering', () => {
    it('should omit undefined values from data', () => {
      logger.info('agent', 'test', { present: 'yes', missing: undefined })

      const output = stdoutSpy.mock.calls[0][0]
      expect(output).toContain('present=yes')
      expect(output).not.toContain('missing')
      expect(output).not.toContain('undefined')
    })

    it('should omit null values from data', () => {
      logger.info('agent', 'test', { present: 'yes', empty: null })

      const output = stdoutSpy.mock.calls[0][0]
      expect(output).toContain('present=yes')
      expect(output).not.toContain('empty')
      expect(output).not.toContain('null')
    })

    it('should omit undefined values from JSONL too', () => {
      logger.configure({ dataDir: '/tmp/test-logs' })

      return new Promise((resolve) => setTimeout(resolve, 10)).then(async () => {
        logger.info('agent', 'test', { present: 'yes', missing: undefined })

        await new Promise((resolve) => setTimeout(resolve, 10))

        const written = appendFile.mock.calls[0][1]
        const entry = JSON.parse(written.trim())
        expect(entry.data).toEqual({ present: 'yes' })
      })
    })

    it('should omit data entirely when all values are undefined', () => {
      logger.info('agent', 'test', { a: undefined, b: null })

      const output = stdoutSpy.mock.calls[0][0]
      expect(output).toMatch(/\[info\] agent: test\n$/)
    })
  })

  describe('console formatting', () => {
    it('should truncate UUID to 8 chars in console', () => {
      logger.info('nervous', 'signal', { traceId: 'b798e927-7b6b-40bb-8b03-c054fc224561' })

      const output = stdoutSpy.mock.calls[0][0]
      expect(output).toContain('traceId=b798e927')
      expect(output).not.toContain('7b6b')
    })

    it('should keep full UUID in JSONL', () => {
      const fullUuid = 'b798e927-7b6b-40bb-8b03-c054fc224561'
      logger.configure({ dataDir: '/tmp/test-logs' })

      return new Promise((resolve) => setTimeout(resolve, 10)).then(async () => {
        logger.info('nervous', 'signal', { traceId: fullUuid })

        await new Promise((resolve) => setTimeout(resolve, 10))

        const written = appendFile.mock.calls[0][1]
        const entry = JSON.parse(written.trim())
        expect(entry.data.traceId).toBe(fullUuid)
      })
    })

    it('should truncate long arrays in console', () => {
      logger.info('keyword', 'expanded', { keywords: ['one', 'two', 'three', 'four', 'five'] })

      const output = stdoutSpy.mock.calls[0][0]
      expect(output).toContain('[one,two...+3]')
    })

    it('should show short arrays in full', () => {
      logger.info('keyword', 'expanded', { keywords: ['one', 'two'] })

      const output = stdoutSpy.mock.calls[0][0]
      expect(output).toContain('keywords=one,two')
    })

    it('should truncate long strings in console', () => {
      const longStr = 'a'.repeat(100)
      logger.info('system', 'test', { detail: longStr })

      const output = stdoutSpy.mock.calls[0][0]
      expect(output).toContain('detail=' + 'a'.repeat(77) + '...')
      expect(output).not.toContain('a'.repeat(100))
    })
  })

  describe('log level filtering', () => {
    it('should suppress info when level is warn', () => {
      logger.configure({ dataDir: '/tmp/test-logs', logLevel: 'warn' })

      return new Promise((resolve) => setTimeout(resolve, 10)).then(() => {
        logger.info('system', 'quiet')
        expect(stdoutSpy).not.toHaveBeenCalled()
      })
    })

    it('should show warn when level is warn', () => {
      logger.configure({ dataDir: '/tmp/test-logs', logLevel: 'warn' })

      return new Promise((resolve) => setTimeout(resolve, 10)).then(() => {
        logger.warn('system', 'visible')

        const calls = stderrSpy.mock.calls.map(c => c[0])
        const hasWarn = calls.some(c => c.includes('[warn] system: visible'))
        expect(hasWarn).toBe(true)
      })
    })
  })
})
