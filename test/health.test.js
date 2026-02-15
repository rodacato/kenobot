import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getStatus, writePid, removePid, checkPid } from '../src/infrastructure/health.js'

describe('Health', () => {
  let tempDir

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
      tempDir = null
    }
  })

  describe('getStatus', () => {
    it('should return status ok', () => {
      const status = getStatus()
      expect(status.status).toBe('ok')
    })

    it('should include pid', () => {
      const status = getStatus()
      expect(status.pid).toBe(process.pid)
    })

    it('should include uptime as integer', () => {
      const status = getStatus()
      expect(typeof status.uptime).toBe('number')
      expect(Number.isInteger(status.uptime)).toBe(true)
      expect(status.uptime).toBeGreaterThanOrEqual(0)
    })

    it('should include memory in MB', () => {
      const status = getStatus()
      expect(status.memory).toHaveProperty('rss')
      expect(status.memory).toHaveProperty('heap')
      expect(typeof status.memory.rss).toBe('number')
      expect(typeof status.memory.heap).toBe('number')
      expect(status.memory.rss).toBeGreaterThan(0)
      expect(status.memory.heap).toBeGreaterThan(0)
    })

    it('should include timestamp', () => {
      const before = Date.now()
      const status = getStatus()
      const after = Date.now()
      expect(status.timestamp).toBeGreaterThanOrEqual(before)
      expect(status.timestamp).toBeLessThanOrEqual(after)
    })
  })

  describe('writePid', () => {
    it('should write current PID to file', async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'health-test-'))
      const pidFile = join(tempDir, 'test.pid')

      await writePid(pidFile)

      const content = await readFile(pidFile, 'utf8')
      expect(parseInt(content)).toBe(process.pid)
    })
  })

  describe('removePid', () => {
    it('should remove PID file', async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'health-test-'))
      const pidFile = join(tempDir, 'test.pid')

      await writePid(pidFile)
      await removePid(pidFile)

      await expect(readFile(pidFile, 'utf8')).rejects.toThrow()
    })

    it('should not throw if file does not exist', async () => {
      await expect(removePid('/tmp/nonexistent-pid-file.pid')).resolves.not.toThrow()
    })
  })

  describe('checkPid', () => {
    it('should return PID when process is running', async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'health-test-'))
      const pidFile = join(tempDir, 'test.pid')

      await writePid(pidFile)
      const pid = await checkPid(pidFile)

      expect(pid).toBe(process.pid)
    })

    it('should throw when PID file does not exist', async () => {
      await expect(checkPid('/tmp/nonexistent-pid-file.pid')).rejects.toThrow()
    })

    it('should throw when process is not running', async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'health-test-'))
      const pidFile = join(tempDir, 'test.pid')

      // Write a PID that's almost certainly not running
      const { writeFile: wf } = await import('node:fs/promises')
      await wf(pidFile, '99999')

      // process.kill(99999, 0) will throw if no process with that PID
      // (unless by very unlikely coincidence one exists)
      await expect(checkPid(pidFile)).rejects.toThrow()
    })
  })
})
