import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import BaseTool from './base.js'
import logger from '../logger.js'

/**
 * DevTool - Run development tasks in workspace projects
 *
 * Enables /dev <project> <task> to run Claude Code with full project context.
 * PROJECTS_DIR points to a parent directory; each subdirectory is a project.
 *
 * Flow: /dev kenobot fix bug → AgentLoop detects devMode → provider runs from ~/Workspaces/kenobot
 */
class DevTool extends BaseTool {
  constructor(projectsDir) {
    super()
    this.projectsDir = projectsDir
  }

  get trigger() {
    return /^\/dev(?:\s+([\s\S]+))?$/i
  }

  parseTrigger(match) {
    return { text: match[1] || '' }
  }

  get definition() {
    return {
      name: 'dev',
      description: `Run development tasks in workspace projects (${this.projectsDir})`,
      input_schema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Project name followed by the task'
          }
        },
        required: ['text']
      }
    }
  }

  async execute({ text }) {
    // No args → list available projects
    if (!text.trim()) {
      const projects = await this._listProjects()
      if (projects.length === 0) {
        return `No projects found in ${this.projectsDir}\n\nEnsure PROJECTS_DIR points to a directory containing your project folders.`
      }
      return `Available projects:\n${projects.map(p => `- ${p}`).join('\n')}\n\nUsage: /dev <project> <task>`
    }

    const parts = text.trim().split(/\s+/)
    const projectName = parts[0]
    const task = parts.slice(1).join(' ')

    // Security: reject path traversal
    if (projectName.includes('/') || projectName.includes('\\') || projectName.includes('..')) {
      return 'Invalid project name.'
    }

    // Verify project directory exists
    const projectPath = join(this.projectsDir, projectName)
    try {
      const s = await stat(projectPath)
      if (!s.isDirectory()) {
        const projects = await this._listProjects()
        return `'${projectName}' is not a directory.\nAvailable projects: ${projects.join(', ')}`
      }
    } catch {
      const projects = await this._listProjects()
      return `Project '${projectName}' not found.\nAvailable projects: ${projects.join(', ') || '(none)'}`
    }

    if (!task) {
      return `No task specified.\nUsage: /dev ${projectName} <describe what to do>`
    }

    logger.info('dev', 'dev_mode_activated', { project: projectName, cwd: projectPath })

    // Return devMode signal — AgentLoop reads this to set provider CWD
    return JSON.stringify({ devMode: true, cwd: projectPath, project: projectName, task })
  }

  /**
   * List subdirectories in PROJECTS_DIR.
   * @private
   */
  async _listProjects() {
    try {
      const entries = await readdir(this.projectsDir, { withFileTypes: true })
      return entries
        .filter(e => e.isDirectory() && !e.name.startsWith('.'))
        .map(e => e.name)
        .sort()
    } catch {
      return []
    }
  }
}

export function register(registry, { config }) {
  if (!config.projectsDir) return
  registry.register(new DevTool(config.projectsDir))
}
