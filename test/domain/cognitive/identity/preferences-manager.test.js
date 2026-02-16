import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

vi.mock('../../../../src/infrastructure/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import PreferencesManager from '../../../../src/domain/cognitive/identity/preferences-manager.js'

describe('PreferencesManager', () => {
  let preferencesManager
  let tempDir
  let preferencesPath
  let bootstrapPath

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prefs-manager-test-'))
    preferencesManager = new PreferencesManager(tempDir)
    preferencesPath = path.join(tempDir, 'preferences.md')
    bootstrapPath = path.join(tempDir, 'BOOTSTRAP.md')
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe('load', () => {
    it('should load preferences.md content', async () => {
      await fs.writeFile(preferencesPath, '# Preferences\n\n- Style: concise')

      const content = await preferencesManager.load()

      expect(content).toBe('# Preferences\n\n- Style: concise')
    })

    it('should return empty string if file not found', async () => {
      const content = await preferencesManager.load()

      expect(content).toBe('')
    })

    it('should trim whitespace', async () => {
      await fs.writeFile(preferencesPath, '  Content  \n\n')

      const content = await preferencesManager.load()

      expect(content).toBe('Content')
    })
  })

  describe('isBootstrapped', () => {
    it('should return false if BOOTSTRAP.md exists', async () => {
      await fs.writeFile(bootstrapPath, 'Bootstrap content')

      const bootstrapped = await preferencesManager.isBootstrapped()

      expect(bootstrapped).toBe(false)
    })

    it('should return true if BOOTSTRAP.md does not exist', async () => {
      const bootstrapped = await preferencesManager.isBootstrapped()

      expect(bootstrapped).toBe(true)
    })
  })

  describe('getBootstrapInstructions', () => {
    it('should load BOOTSTRAP.md content', async () => {
      await fs.writeFile(bootstrapPath, 'Bootstrap instructions')

      const content = await preferencesManager.getBootstrapInstructions()

      expect(content).toBe('Bootstrap instructions')
    })

    it('should return null if file not found', async () => {
      const content = await preferencesManager.getBootstrapInstructions()

      expect(content).toBeNull()
    })
  })

  describe('saveBootstrapAnswers', () => {
    it('should save answers to preferences.md', async () => {
      await preferencesManager.saveBootstrapAnswers({
        'Communication style': 'concise',
        'Preferred language': 'spanish'
      })

      const content = await fs.readFile(preferencesPath, 'utf-8')
      expect(content).toContain('# User Preferences')
      expect(content).toContain('## From Bootstrap')
      expect(content).toContain('Communication style: concise')
      expect(content).toContain('Preferred language: spanish')
    })

    it('should append to existing preferences', async () => {
      await fs.writeFile(preferencesPath, '# Existing\n\n- Old pref')

      await preferencesManager.saveBootstrapAnswers({ 'New': 'value' })

      const content = await fs.readFile(preferencesPath, 'utf-8')
      expect(content).toContain('# Existing')
      expect(content).toContain('- Old pref')
      expect(content).toContain('## From Bootstrap')
    })

    it('should delete BOOTSTRAP.md after saving', async () => {
      await fs.writeFile(bootstrapPath, 'Bootstrap content')

      await preferencesManager.saveBootstrapAnswers({ 'Test': 'value' })

      const exists = await fs.access(bootstrapPath).then(() => true).catch(() => false)
      expect(exists).toBe(false)
    })
  })

  describe('updatePreference', () => {
    it('should append new preference', async () => {
      await preferencesManager.updatePreference('editor', 'vim')

      const content = await fs.readFile(preferencesPath, 'utf-8')
      expect(content).toContain('- editor: vim')
    })

    it('should append to existing preferences', async () => {
      await fs.writeFile(preferencesPath, '# Preferences\n\n- Old: value')

      await preferencesManager.updatePreference('new', 'value')

      const content = await fs.readFile(preferencesPath, 'utf-8')
      expect(content).toContain('- Old: value')
      expect(content).toContain('- new: value')
    })
  })

  describe('hasPreferences', () => {
    it('should return true if preferences exist', async () => {
      await fs.writeFile(preferencesPath, '- Some preference')

      const has = await preferencesManager.hasPreferences()

      expect(has).toBe(true)
    })

    it('should return false if file is empty', async () => {
      await fs.writeFile(preferencesPath, '')

      const has = await preferencesManager.hasPreferences()

      expect(has).toBe(false)
    })

    it('should return false if file does not exist', async () => {
      const has = await preferencesManager.hasPreferences()

      expect(has).toBe(false)
    })
  })
})
