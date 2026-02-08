import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import defaultLogger from '../logger.js'

const MAX_TRIGGERS = 20
const MAX_TRIGGER_LENGTH = 100
const MAX_NAME_LENGTH = 64
const MAX_DESCRIPTION_LENGTH = 256

/**
 * Validate manifest schema beyond basic truthy checks.
 * @param {Object} meta - Parsed manifest
 * @returns {string|null} Error reason or null if valid
 */
function validateManifest(meta) {
  if (typeof meta.name !== 'string' || meta.name.length > MAX_NAME_LENGTH) {
    return `name must be a string (max ${MAX_NAME_LENGTH} chars)`
  }
  if (typeof meta.description !== 'string' || meta.description.length > MAX_DESCRIPTION_LENGTH) {
    return `description must be a string (max ${MAX_DESCRIPTION_LENGTH} chars)`
  }
  if (!Array.isArray(meta.triggers) || meta.triggers.length === 0) {
    return 'triggers must be a non-empty array'
  }
  if (meta.triggers.length > MAX_TRIGGERS) {
    return `too many triggers (max ${MAX_TRIGGERS})`
  }
  for (const t of meta.triggers) {
    if (typeof t !== 'string' || t.length === 0 || t.length > MAX_TRIGGER_LENGTH) {
      return `each trigger must be a non-empty string (max ${MAX_TRIGGER_LENGTH} chars)`
    }
  }
  return null
}

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
  constructor(skillsDir, { logger = defaultLogger } = {}) {
    this.skillsDir = skillsDir
    this.logger = logger
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
        this.logger.info('skills', 'no_skills_directory', { dir: this.skillsDir })
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

        const invalid = validateManifest(meta)
        if (invalid) {
          this.logger.warn('skills', 'invalid_skill', { dir: entry.name, reason: invalid })
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

        this.logger.info('skills', 'skill_loaded', {
          name: meta.name,
          triggers: meta.triggers.length
        })
      } catch (error) {
        this.logger.warn('skills', 'skill_load_failed', {
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

    const invalid = validateManifest(meta)
    if (invalid) {
      throw new Error(`Invalid skill manifest: ${invalid}`)
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

    this.logger.info('skills', 'skill_hot_loaded', { name: meta.name, triggers: meta.triggers.length })
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
      this.logger.warn('skills', 'prompt_load_failed', {
        name,
        error: error.message
      })
      return null
    }
  }

  /**
   * Prompt section for ContextBuilder.
   * Returns skill list + active skill prompt if message matches a trigger.
   * @param {{ messageText?: string }} context
   * @returns {{ label: string, content: string, metadata?: { activeSkill: string } }|null}
   */
  async getPromptSection({ messageText = '' } = {}) {
    if (this.size === 0) return null

    const skills = this.getAll()
    const skillList = skills.map(s => `- ${s.name}: ${s.description}`).join('\n')
    let content = skillList

    let metadata
    const matched = this.match(messageText)
    if (matched) {
      const prompt = await this.getPrompt(matched.name)
      if (prompt) {
        content += `\n\n---\n\n## Active skill: ${matched.name}\n${prompt}`
        metadata = { activeSkill: matched.name }
      }
    }

    return { label: 'Available skills', content, metadata }
  }

  get size() {
    return this.skills.size
  }
}
