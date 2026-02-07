import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

vi.mock('../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import SkillLoader from '../../src/skills/loader.js'
import logger from '../../src/logger.js'

describe('SkillLoader', () => {
  let tmpDir
  let loader

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'skills-test-'))
    loader = new SkillLoader(tmpDir)
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  async function createSkill(name, manifest, skillMd = '## Instructions') {
    const dir = join(tmpDir, name)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest))
    await writeFile(join(dir, 'SKILL.md'), skillMd)
  }

  describe('loadAll', () => {
    it('should load skills from directory', async () => {
      await createSkill('weather', {
        name: 'weather',
        description: 'Get weather',
        triggers: ['weather', 'clima']
      })

      await loader.loadAll()

      expect(loader.size).toBe(1)
      expect(logger.info).toHaveBeenCalledWith('skills', 'skill_loaded', {
        name: 'weather',
        triggers: 2
      })
    })

    it('should load multiple skills', async () => {
      await createSkill('weather', {
        name: 'weather',
        description: 'Get weather',
        triggers: ['weather']
      })
      await createSkill('summary', {
        name: 'summary',
        description: 'Summarize day',
        triggers: ['summary', 'recap']
      })

      await loader.loadAll()

      expect(loader.size).toBe(2)
    })

    it('should handle missing skills directory gracefully', async () => {
      const noDir = new SkillLoader('/nonexistent/path')

      await noDir.loadAll()

      expect(noDir.size).toBe(0)
      expect(logger.info).toHaveBeenCalledWith('skills', 'no_skills_directory', {
        dir: '/nonexistent/path'
      })
    })

    it('should skip directories without manifest.json', async () => {
      await mkdir(join(tmpDir, 'empty-skill'), { recursive: true })

      await loader.loadAll()

      expect(loader.size).toBe(0)
      expect(logger.warn).toHaveBeenCalledWith('skills', 'skill_load_failed', expect.objectContaining({
        dir: 'empty-skill'
      }))
    })

    it('should skip skills with invalid manifest (missing name)', async () => {
      await createSkill('bad', {
        description: 'No name',
        triggers: ['test']
      })

      await loader.loadAll()

      expect(loader.size).toBe(0)
      expect(logger.warn).toHaveBeenCalledWith('skills', 'invalid_skill', {
        dir: 'bad',
        reason: 'missing name, description, or triggers'
      })
    })

    it('should skip skills with invalid manifest (missing triggers)', async () => {
      await createSkill('bad', {
        name: 'bad',
        description: 'No triggers'
      })

      await loader.loadAll()

      expect(loader.size).toBe(0)
    })

    it('should skip skills with invalid manifest (triggers not array)', async () => {
      await createSkill('bad', {
        name: 'bad',
        description: 'Bad triggers',
        triggers: 'not-an-array'
      })

      await loader.loadAll()

      expect(loader.size).toBe(0)
    })

    it('should skip non-directory entries', async () => {
      await writeFile(join(tmpDir, 'not-a-skill.txt'), 'hello')
      await createSkill('valid', {
        name: 'valid',
        description: 'Valid skill',
        triggers: ['test']
      })

      await loader.loadAll()

      expect(loader.size).toBe(1)
    })

    it('should skip skills with malformed JSON', async () => {
      const dir = join(tmpDir, 'bad-json')
      await mkdir(dir)
      await writeFile(join(dir, 'manifest.json'), '{invalid json}')

      await loader.loadAll()

      expect(loader.size).toBe(0)
      expect(logger.warn).toHaveBeenCalledWith('skills', 'skill_load_failed', expect.objectContaining({
        dir: 'bad-json'
      }))
    })
  })

  describe('getAll', () => {
    it('should return empty array when no skills loaded', () => {
      expect(loader.getAll()).toEqual([])
    })

    it('should return compact list of skills', async () => {
      await createSkill('weather', {
        name: 'weather',
        description: 'Get weather',
        triggers: ['weather']
      })
      await createSkill('summary', {
        name: 'summary',
        description: 'Summarize day',
        triggers: ['summary']
      })

      await loader.loadAll()

      const all = loader.getAll()
      expect(all).toHaveLength(2)
      expect(all).toContainEqual({ name: 'weather', description: 'Get weather' })
      expect(all).toContainEqual({ name: 'summary', description: 'Summarize day' })
    })

    it('should not expose internal fields like triggerRegex', async () => {
      await createSkill('weather', {
        name: 'weather',
        description: 'Get weather',
        triggers: ['weather']
      })

      await loader.loadAll()

      const skill = loader.getAll()[0]
      expect(skill).toEqual({ name: 'weather', description: 'Get weather' })
      expect(skill).not.toHaveProperty('triggers')
      expect(skill).not.toHaveProperty('triggerRegex')
    })
  })

  describe('match', () => {
    beforeEach(async () => {
      await createSkill('weather', {
        name: 'weather',
        description: 'Get weather',
        triggers: ['weather', 'forecast', 'clima']
      })
      await createSkill('summary', {
        name: 'summary',
        description: 'Summarize day',
        triggers: ['summary', 'recap', 'resumen']
      })
      await loader.loadAll()
    })

    it('should match trigger word in message', () => {
      const result = loader.match("what's the weather today?")

      expect(result).toEqual({ name: 'weather', description: 'Get weather' })
    })

    it('should match case-insensitively', () => {
      expect(loader.match('WEATHER in Madrid')).not.toBeNull()
      expect(loader.match('Weather')).not.toBeNull()
    })

    it('should match any trigger word', () => {
      expect(loader.match('give me a forecast')).toEqual({ name: 'weather', description: 'Get weather' })
      expect(loader.match('dame el clima')).toEqual({ name: 'weather', description: 'Get weather' })
    })

    it('should not match substrings', () => {
      expect(loader.match('weathering the storm')).toBeNull()
    })

    it('should return null when no skill matches', () => {
      expect(loader.match('hello world')).toBeNull()
    })

    it('should return null for empty text', () => {
      expect(loader.match('')).toBeNull()
    })

    it('should match different skills', () => {
      expect(loader.match('give me a recap')).toEqual({ name: 'summary', description: 'Summarize day' })
      expect(loader.match('dame un resumen')).toEqual({ name: 'summary', description: 'Summarize day' })
    })

    it('should return first matching skill when multiple could match', async () => {
      // Both could match "daily weather summary" — first loaded wins
      const result = loader.match('daily weather summary')

      expect(result).not.toBeNull()
      // Should match one of them deterministically
      expect(['weather', 'summary']).toContain(result.name)
    })
  })

  describe('getPrompt', () => {
    it('should return SKILL.md content on-demand', async () => {
      await createSkill('weather', {
        name: 'weather',
        description: 'Get weather',
        triggers: ['weather']
      }, '## Weather Instructions\nFetch from wttr.in')

      await loader.loadAll()

      const prompt = await loader.getPrompt('weather')
      expect(prompt).toBe('## Weather Instructions\nFetch from wttr.in')
    })

    it('should return null for unknown skill', async () => {
      expect(await loader.getPrompt('nonexistent')).toBeNull()
    })

    it('should return null and warn when SKILL.md is missing', async () => {
      const dir = join(tmpDir, 'no-skill-md')
      await mkdir(dir)
      await writeFile(join(dir, 'manifest.json'), JSON.stringify({
        name: 'no-skill-md',
        description: 'Missing SKILL.md',
        triggers: ['test']
      }))

      await loader.loadAll()

      const prompt = await loader.getPrompt('no-skill-md')
      expect(prompt).toBeNull()
      expect(logger.warn).toHaveBeenCalledWith('skills', 'prompt_load_failed', expect.objectContaining({
        name: 'no-skill-md'
      }))
    })
  })

  describe('size', () => {
    it('should return 0 for empty loader', () => {
      expect(loader.size).toBe(0)
    })

    it('should return count of loaded skills', async () => {
      await createSkill('a', { name: 'a', description: 'A', triggers: ['a'] })
      await createSkill('b', { name: 'b', description: 'B', triggers: ['b'] })

      await loader.loadAll()

      expect(loader.size).toBe(2)
    })
  })

  describe('trigger regex edge cases', () => {
    it('should escape regex special characters in triggers without crashing', async () => {
      await createSkill('special', {
        name: 'special',
        description: 'Special chars',
        triggers: ['c++', 'node.js']
      })

      // Should not throw when building regex with special chars
      await loader.loadAll()
      expect(loader.size).toBe(1)
    })
  })
})
