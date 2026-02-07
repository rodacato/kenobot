import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import logger from '../logger.js'

/**
 * SkillLoader - Discovers, loads, and matches skills from a directory
 *
 * Skills are directories containing:
 *   manifest.json  — { name, description, triggers[] }
 *   SKILL.md       — Instructions for the agent (loaded on-demand)
 *
 * At startup, only manifest.json is read. SKILL.md is loaded on-demand
 * when a message triggers the skill, keeping memory usage low.
 */
export default class SkillLoader {
  constructor(skillsDir) {
    this.skillsDir = skillsDir
    this.skills = new Map()
  }

  /**
   * Scan skills directory and load all manifest.json files.
   * SKILL.md files are NOT read here — only on-demand via getPrompt().
   */
  async loadAll() {
    let entries
    try {
      entries = await readdir(this.skillsDir, { withFileTypes: true })
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.info('skills', 'no_skills_directory', { dir: this.skillsDir })
        return
      }
      throw error
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      try {
        const metaPath = join(this.skillsDir, entry.name, 'manifest.json')
        const raw = await readFile(metaPath, 'utf8')
        const meta = JSON.parse(raw)

        if (!meta.name || !meta.description || !Array.isArray(meta.triggers)) {
          logger.warn('skills', 'invalid_skill', {
            dir: entry.name,
            reason: 'missing name, description, or triggers'
          })
          continue
        }

        const escaped = meta.triggers.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        const triggerRegex = new RegExp(`\\b(${escaped.join('|')})\\b`, 'i')

        this.skills.set(meta.name, {
          name: meta.name,
          description: meta.description,
          triggers: meta.triggers,
          triggerRegex,
          skillMdPath: join(this.skillsDir, entry.name, 'SKILL.md')
        })

        logger.info('skills', 'skill_loaded', {
          name: meta.name,
          triggers: meta.triggers.length
        })
      } catch (error) {
        logger.warn('skills', 'skill_load_failed', {
          dir: entry.name,
          error: error.message
        })
      }
    }
  }

  /**
   * Load a single skill by name from a specific directory.
   * Used for hot-reloading after approval.
   * @param {string} name - Skill directory name
   * @param {string} skillsDir - Directory containing the skill
   */
  async loadOne(name, skillsDir) {
    const metaPath = join(skillsDir, name, 'manifest.json')
    const raw = await readFile(metaPath, 'utf8')
    const meta = JSON.parse(raw)

    if (!meta.name || !meta.description || !Array.isArray(meta.triggers)) {
      throw new Error(`Invalid skill manifest: missing name, description, or triggers`)
    }

    const escaped = meta.triggers.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const triggerRegex = new RegExp(`\\b(${escaped.join('|')})\\b`, 'i')

    this.skills.set(meta.name, {
      name: meta.name,
      description: meta.description,
      triggers: meta.triggers,
      triggerRegex,
      skillMdPath: join(skillsDir, name, 'SKILL.md')
    })

    logger.info('skills', 'skill_hot_loaded', { name: meta.name, triggers: meta.triggers.length })
  }

  /**
   * Get compact list for system prompt injection.
   * @returns {{ name: string, description: string }[]}
   */
  getAll() {
    return Array.from(this.skills.values()).map(s => ({
      name: s.name,
      description: s.description
    }))
  }

  /**
   * Match message text against skill triggers.
   * @param {string} text - User message
   * @returns {{ name: string, description: string }|null} First matching skill
   */
  match(text) {
    for (const skill of this.skills.values()) {
      if (skill.triggerRegex.test(text)) {
        return { name: skill.name, description: skill.description }
      }
    }
    return null
  }

  /**
   * Load full SKILL.md for a skill (on-demand).
   * @param {string} name - Skill name
   * @returns {Promise<string|null>} Prompt content or null
   */
  async getPrompt(name) {
    const skill = this.skills.get(name)
    if (!skill) return null

    try {
      return await readFile(skill.skillMdPath, 'utf8')
    } catch (error) {
      logger.warn('skills', 'prompt_load_failed', {
        name,
        error: error.message
      })
      return null
    }
  }

  get size() {
    return this.skills.size
  }
}
