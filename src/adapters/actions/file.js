import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { resolveWorkspace } from '../../domain/motor/workspace.js'
import { safePath } from '../../infrastructure/safe-path.js'
import defaultLogger from '../../infrastructure/logger.js'

const READ_MAX_CHARS = 50_000
const MAX_DEPTH = 10
const MAX_ENTRIES = 500

export function createReadFile(motorConfig) {
  return {
    definition: {
      name: 'read_file',
      description: 'Read the contents of a file from a cloned repository workspace. Returns the file content as text. Large files are truncated at 50K characters.',
      input_schema: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository in "owner/repo" format' },
          path: { type: 'string', description: 'File path relative to repo root (e.g. "src/index.js")' }
        },
        required: ['repo', 'path']
      }
    },

    async execute({ repo, path }, { logger = defaultLogger } = {}) {
      const workDir = resolveWorkspace(motorConfig.workspacesDir, repo)
      const filePath = safePath(workDir, path)

      let content = await readFile(filePath, 'utf8')
      if (content.length > READ_MAX_CHARS) {
        content = content.slice(0, READ_MAX_CHARS) + `\n[Truncated at ${READ_MAX_CHARS} characters]`
      }
      return content
    }
  }
}

export function createWriteFile(motorConfig) {
  return {
    definition: {
      name: 'write_file',
      description: 'Write content to a file in a cloned repository workspace. Creates parent directories if needed. Overwrites existing files.',
      input_schema: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository in "owner/repo" format' },
          path: { type: 'string', description: 'File path relative to repo root (e.g. "src/index.js")' },
          content: { type: 'string', description: 'File content to write' }
        },
        required: ['repo', 'path', 'content']
      }
    },

    async execute({ repo, path, content }, { logger = defaultLogger } = {}) {
      const workDir = resolveWorkspace(motorConfig.workspacesDir, repo)
      const filePath = safePath(workDir, path)

      const dir = filePath.slice(0, filePath.lastIndexOf('/'))
      await mkdir(dir, { recursive: true })

      await writeFile(filePath, content, 'utf8')
      return `Wrote ${content.length} bytes to ${path}`
    }
  }
}

export function createListFiles(motorConfig) {
  return {
    definition: {
      name: 'list_files',
      description: 'List files in a cloned repository workspace. Returns a recursive directory listing. Optionally filter by a subdirectory path.',
      input_schema: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository in "owner/repo" format' },
          path: { type: 'string', description: 'Subdirectory path (default: repo root)' }
        },
        required: ['repo']
      }
    },

    async execute({ repo, path = '.' }, { logger = defaultLogger } = {}) {
      const workDir = resolveWorkspace(motorConfig.workspacesDir, repo)
      const targetDir = safePath(workDir, path)

      const entries = await listRecursive(targetDir, workDir, 0)
      if (entries.length === 0) {
        return 'No files found.'
      }
      return entries.join('\n')
    }
  }
}

async function listRecursive(dir, baseDir, depth) {
  if (depth > MAX_DEPTH) return []

  const entries = []
  const items = await readdir(dir, { withFileTypes: true })

  for (const item of items) {
    if (entries.length >= MAX_ENTRIES) {
      entries.push(`[... truncated at ${MAX_ENTRIES} entries]`)
      break
    }

    if (item.name === '.git' || item.name === 'node_modules') continue

    const fullPath = join(dir, item.name)
    const relPath = relative(baseDir, fullPath)

    if (item.isDirectory()) {
      entries.push(relPath + '/')
      const subEntries = await listRecursive(fullPath, baseDir, depth + 1)
      entries.push(...subEntries)
    } else {
      entries.push(relPath)
    }
  }

  return entries
}
