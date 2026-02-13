import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

vi.mock('../../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import CoreLoader from '../../../src/cognitive/identity/core-loader.js'

describe('CoreLoader', () => {
  let coreLoader
  let tempDir
  let corePath

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'core-loader-test-'))
    coreLoader = new CoreLoader(tempDir)
    corePath = path.join(tempDir, 'core.md')
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe('load', () => {
    it('should load core.md content', async () => {
      await fs.writeFile(corePath, '# Core Personality\n\nFriendly and helpful')

      const content = await coreLoader.load()

      expect(content).toBe('# Core Personality\n\nFriendly and helpful')
    })

    it('should cache loaded content', async () => {
      await fs.writeFile(corePath, 'Original content')

      const content1 = await coreLoader.load()
      await fs.writeFile(corePath, 'Modified content')
      const content2 = await coreLoader.load()

      expect(content1).toBe('Original content')
      expect(content2).toBe('Original content') // Still cached
    })

    it('should return empty string if file not found', async () => {
      const content = await coreLoader.load()

      expect(content).toBe('')
    })

    it('should trim whitespace', async () => {
      await fs.writeFile(corePath, '  Content with spaces  \n\n')

      const content = await coreLoader.load()

      expect(content).toBe('Content with spaces')
    })
  })

  describe('reload', () => {
    it('should clear cache and reload', async () => {
      await fs.writeFile(corePath, 'Original content')
      await coreLoader.load()

      await fs.writeFile(corePath, 'Modified content')
      const content = await coreLoader.reload()

      expect(content).toBe('Modified content')
    })
  })

  describe('exists', () => {
    it('should return true if core.md exists', async () => {
      await fs.writeFile(corePath, 'Content')

      const exists = await coreLoader.exists()

      expect(exists).toBe(true)
    })

    it('should return false if core.md does not exist', async () => {
      const exists = await coreLoader.exists()

      expect(exists).toBe(false)
    })
  })
})
