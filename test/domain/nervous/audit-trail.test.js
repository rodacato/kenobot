import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Signal from '../../../src/domain/nervous/signal.js'
import AuditTrail from '../../../src/domain/nervous/audit-trail.js'

vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

describe('AuditTrail', () => {
  let dataDir
  let trail

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'audit-trail-test-'))
    trail = new AuditTrail(dataDir)
  })

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true })
  })

  describe('log', () => {
    it('should write signal to JSONL file', async () => {
      const signal = new Signal('message:in', { text: 'hello' }, { source: 'telegram' })
      trail.log(signal)

      // Wait for async write
      await new Promise(r => setTimeout(r, 50))

      const signalDir = join(dataDir, 'nervous', 'signals')
      const files = await readdir(signalDir)
      expect(files).toHaveLength(1)
      expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}\.jsonl$/)

      const content = await readFile(join(signalDir, files[0]), 'utf8')
      const entry = JSON.parse(content.trim())
      expect(entry.type).toBe('message:in')
      expect(entry.source).toBe('telegram')
      expect(entry.payload.text).toBe('hello')
    })

    it('should append multiple signals to same file', async () => {
      trail.log(new Signal('message:in', { text: 'one' }, { source: 'a' }))
      trail.log(new Signal('message:out', { text: 'two' }, { source: 'b' }))

      await new Promise(r => setTimeout(r, 100))

      const signalDir = join(dataDir, 'nervous', 'signals')
      const files = await readdir(signalDir)
      const content = await readFile(join(signalDir, files[0]), 'utf8')
      const lines = content.trim().split('\n')

      expect(lines).toHaveLength(2)
      expect(JSON.parse(lines[0]).type).toBe('message:in')
      expect(JSON.parse(lines[1]).type).toBe('message:out')
    })

    it('should skip excluded signal types', async () => {
      trail.log(new Signal('thinking:start', { chatId: '1' }, { source: 'agent' }))

      await new Promise(r => setTimeout(r, 50))

      const signalDir = join(dataDir, 'nervous', 'signals')
      let files
      try { files = await readdir(signalDir) } catch { files = [] }
      // Either no directory or empty file
      expect(files).toHaveLength(0)
    })
  })

  describe('query', () => {
    it('should return signals matching type filter', async () => {
      trail.log(new Signal('message:in', { text: 'a' }, { source: 'x' }))
      trail.log(new Signal('error', { msg: 'b' }, { source: 'y' }))
      trail.log(new Signal('message:in', { text: 'c' }, { source: 'z' }))

      await new Promise(r => setTimeout(r, 100))

      const results = await trail.query({ type: 'message:in' })

      expect(results).toHaveLength(2)
      expect(results.every(r => r.type === 'message:in')).toBe(true)
    })

    it('should return signals matching traceId', async () => {
      trail.log(new Signal('message:in', {}, { source: 'a', traceId: 'trace-1' }))
      trail.log(new Signal('message:out', {}, { source: 'b', traceId: 'trace-1' }))
      trail.log(new Signal('message:in', {}, { source: 'c', traceId: 'trace-2' }))

      await new Promise(r => setTimeout(r, 100))

      const results = await trail.query({ traceId: 'trace-1' })

      expect(results).toHaveLength(2)
      expect(results.every(r => r.traceId === 'trace-1')).toBe(true)
    })

    it('should respect limit', async () => {
      for (let i = 0; i < 10; i++) {
        trail.log(new Signal('test', { i }, { source: 'bench' }))
      }

      await new Promise(r => setTimeout(r, 100))

      const results = await trail.query({ limit: 3 })

      expect(results).toHaveLength(3)
    })

    it('should return empty array when no signals exist', async () => {
      const results = await trail.query()

      expect(results).toEqual([])
    })
  })
})
