import { readFile, writeFile, readdir, unlink, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import BaseTool from './base.js'
import { safePath } from '../utils/safe-path.js'

/**
 * WorkspaceTool - File operations within the bot's workspace
 *
 * All paths are sandboxed to the workspace directory via safePath().
 * Supports: read, write, list, delete operations.
 *
 * Slash command: /workspace list [path]
 * LLM tool_use: workspace { action: "write", path: "notes/idea.md", content: "..." }
 */
export default class WorkspaceTool extends BaseTool {
  constructor(workspaceDir) {
    super()
    this.baseDir = workspaceDir
  }

  get definition() {
    return {
      name: 'workspace',
      description: 'Read, write, list, and delete files in your personal workspace',
      input_schema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['read', 'write', 'list', 'delete'],
            description: 'Operation to perform'
          },
          path: {
            type: 'string',
            description: 'Relative path within workspace'
          },
          content: {
            type: 'string',
            description: 'File content (required for write)'
          }
        },
        required: ['action', 'path']
      }
    }
  }

  get trigger() {
    return /^\/workspace\s+(\w+)\s*(.*)/i
  }

  parseTrigger(match) {
    return { action: match[1], path: match[2].trim() || '.' }
  }

  async execute(input) {
    const resolved = safePath(this.baseDir, input.path)

    switch (input.action) {
      case 'read':
        return await readFile(resolved, 'utf8')

      case 'write': {
        if (!input.content && input.content !== '') {
          throw new Error('content is required for write action')
        }
        await mkdir(dirname(resolved), { recursive: true })
        await writeFile(resolved, input.content, 'utf8')
        return `Written: ${input.path}`
      }

      case 'list': {
        const entries = await readdir(resolved, { withFileTypes: true })
        return entries
          .map(e => e.isDirectory() ? `${e.name}/` : e.name)
          .join('\n') || '(empty)'
      }

      case 'delete':
        await unlink(resolved)
        return `Deleted: ${input.path}`

      default:
        throw new Error(`Unknown action: ${input.action}`)
    }
  }
}

export function register(registry, { config }) {
  if (!config.workspaceDir) return
  registry.register(new WorkspaceTool(config.workspaceDir))
}
