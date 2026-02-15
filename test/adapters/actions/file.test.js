import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'

// Suppress logger console output during tests
vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import { createReadFile, createWriteFile, createListFiles } from '../../../src/adapters/actions/file.js'

describe('File Actions', () => {
  let tmpDir
  let motorConfig
  let workspaceDir

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kenobot-file-actions-'))

    // Create workspace structure: {tmpDir}/owner/repo/
    workspaceDir = join(tmpDir, 'testowner', 'testrepo')
    await mkdir(workspaceDir, { recursive: true })

    motorConfig = { workspacesDir: tmpDir }

    // Create sample files
    await writeFile(join(workspaceDir, 'README.md'), '# Test Repository\n\nThis is a test.')
    await mkdir(join(workspaceDir, 'src'), { recursive: true })
    await writeFile(join(workspaceDir, 'src', 'index.js'), 'console.log("hello")')
    await writeFile(join(workspaceDir, 'src', 'utils.js'), 'export function add(a, b) { return a + b }')

    // Create .git and node_modules (should be skipped in listings)
    await mkdir(join(workspaceDir, '.git'), { recursive: true })
    await writeFile(join(workspaceDir, '.git', 'config'), '[core]')
    await mkdir(join(workspaceDir, 'node_modules'), { recursive: true })
    await writeFile(join(workspaceDir, 'node_modules', 'package.json'), '{}')

    vi.clearAllMocks()
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  describe('createReadFile', () => {
    it('should return tool definition with correct schema', () => {
      const tool = createReadFile(motorConfig)

      expect(tool.definition).toBeDefined()
      expect(tool.definition.name).toBe('read_file')
      expect(tool.definition.description).toContain('Read the contents of a file')
      expect(tool.definition.input_schema.properties.repo).toBeDefined()
      expect(tool.definition.input_schema.properties.path).toBeDefined()
      expect(tool.definition.input_schema.required).toEqual(['repo', 'path'])
    })

    it('should read an existing file', async () => {
      const tool = createReadFile(motorConfig)
      const content = await tool.execute({
        repo: 'testowner/testrepo',
        path: 'README.md'
      })

      expect(content).toBe('# Test Repository\n\nThis is a test.')
    })

    it('should read a file in a subdirectory', async () => {
      const tool = createReadFile(motorConfig)
      const content = await tool.execute({
        repo: 'testowner/testrepo',
        path: 'src/index.js'
      })

      expect(content).toBe('console.log("hello")')
    })

    it('should throw error for non-existent file', async () => {
      const tool = createReadFile(motorConfig)

      await expect(
        tool.execute({ repo: 'testowner/testrepo', path: 'nonexistent.txt' })
      ).rejects.toThrow()
    })

    it('should block path traversal attacks', async () => {
      const tool = createReadFile(motorConfig)

      await expect(
        tool.execute({ repo: 'testowner/testrepo', path: '../../../etc/passwd' })
      ).rejects.toThrow('Path traversal blocked')
    })

    it('should truncate files larger than 50K characters', async () => {
      const tool = createReadFile(motorConfig)

      // Create a file with >50K chars
      const largeContent = 'a'.repeat(60000)
      await writeFile(join(workspaceDir, 'large.txt'), largeContent)

      const content = await tool.execute({
        repo: 'testowner/testrepo',
        path: 'large.txt'
      })

      expect(content.length).toBeLessThan(60000)
      expect(content).toContain('[Truncated at 50000 characters]')
      expect(content.length).toBe(50000 + '\n[Truncated at 50000 characters]'.length)
    })
  })

  describe('createWriteFile', () => {
    it('should return tool definition with correct schema', () => {
      const tool = createWriteFile(motorConfig)

      expect(tool.definition).toBeDefined()
      expect(tool.definition.name).toBe('write_file')
      expect(tool.definition.description).toContain('Write content to a file')
      expect(tool.definition.input_schema.properties.repo).toBeDefined()
      expect(tool.definition.input_schema.properties.path).toBeDefined()
      expect(tool.definition.input_schema.properties.content).toBeDefined()
      expect(tool.definition.input_schema.required).toEqual(['repo', 'path', 'content'])
    })

    it('should write a new file', async () => {
      const tool = createWriteFile(motorConfig)
      const result = await tool.execute({
        repo: 'testowner/testrepo',
        path: 'newfile.txt',
        content: 'Hello, world!'
      })

      expect(result).toContain('Wrote 13 bytes to newfile.txt')

      const written = await readFile(join(workspaceDir, 'newfile.txt'), 'utf8')
      expect(written).toBe('Hello, world!')
    })

    it('should overwrite an existing file', async () => {
      const tool = createWriteFile(motorConfig)

      await tool.execute({
        repo: 'testowner/testrepo',
        path: 'README.md',
        content: 'Updated content'
      })

      const written = await readFile(join(workspaceDir, 'README.md'), 'utf8')
      expect(written).toBe('Updated content')
    })

    it('should create parent directories if needed', async () => {
      const tool = createWriteFile(motorConfig)

      const result = await tool.execute({
        repo: 'testowner/testrepo',
        path: 'deep/nested/dir/file.txt',
        content: 'nested file'
      })

      expect(result).toContain('Wrote 11 bytes')

      const written = await readFile(join(workspaceDir, 'deep/nested/dir/file.txt'), 'utf8')
      expect(written).toBe('nested file')
    })

    it('should block path traversal attacks', async () => {
      const tool = createWriteFile(motorConfig)

      await expect(
        tool.execute({
          repo: 'testowner/testrepo',
          path: '../../../tmp/evil.txt',
          content: 'malicious'
        })
      ).rejects.toThrow('Path traversal blocked')
    })
  })

  describe('createListFiles', () => {
    it('should return tool definition with correct schema', () => {
      const tool = createListFiles(motorConfig)

      expect(tool.definition).toBeDefined()
      expect(tool.definition.name).toBe('list_files')
      expect(tool.definition.description).toContain('List files in a cloned repository')
      expect(tool.definition.input_schema.properties.repo).toBeDefined()
      expect(tool.definition.input_schema.properties.path).toBeDefined()
      expect(tool.definition.input_schema.required).toEqual(['repo'])
    })

    it('should list files in repository root', async () => {
      const tool = createListFiles(motorConfig)
      const listing = await tool.execute({ repo: 'testowner/testrepo' })

      expect(listing).toContain('README.md')
      expect(listing).toContain('src/')
      expect(listing).toContain('src/index.js')
      expect(listing).toContain('src/utils.js')
    })

    it('should skip .git and node_modules directories', async () => {
      const tool = createListFiles(motorConfig)
      const listing = await tool.execute({ repo: 'testowner/testrepo' })

      expect(listing).not.toContain('.git')
      expect(listing).not.toContain('node_modules')
      expect(listing).not.toContain('.git/config')
      expect(listing).not.toContain('node_modules/package.json')
    })

    it('should list files in a subdirectory', async () => {
      const tool = createListFiles(motorConfig)
      const listing = await tool.execute({
        repo: 'testowner/testrepo',
        path: 'src'
      })

      expect(listing).toContain('index.js')
      expect(listing).toContain('utils.js')
      expect(listing).not.toContain('README.md')
    })

    it('should return "No files found." for empty directory', async () => {
      const emptyDir = join(workspaceDir, 'empty')
      await mkdir(emptyDir, { recursive: true })

      const tool = createListFiles(motorConfig)
      const listing = await tool.execute({
        repo: 'testowner/testrepo',
        path: 'empty'
      })

      expect(listing).toBe('No files found.')
    })

    it('should cap listing at 500 entries', async () => {
      // Create 600 files
      for (let i = 0; i < 600; i++) {
        await writeFile(join(workspaceDir, `file${i}.txt`), `content ${i}`)
      }

      const tool = createListFiles(motorConfig)
      const listing = await tool.execute({ repo: 'testowner/testrepo' })

      const lines = listing.split('\n')
      expect(lines).toContain('[... truncated at 500 entries]')
      expect(lines.length).toBeLessThanOrEqual(501) // 500 entries + truncation message
    })

    it('should respect max depth of 10', async () => {
      // Create a deeply nested structure (12 levels)
      let deepPath = workspaceDir
      for (let i = 0; i < 12; i++) {
        deepPath = join(deepPath, `level${i}`)
        await mkdir(deepPath, { recursive: true })
        await writeFile(join(deepPath, 'file.txt'), `depth ${i}`)
      }

      const tool = createListFiles(motorConfig)
      const listing = await tool.execute({ repo: 'testowner/testrepo' })

      // Should include directories and files up to depth 10
      // depth 0 = level0/, depth 1 = level0/level1/, etc.
      expect(listing).toContain('level0/')
      expect(listing).toContain('level0/level1/level2/level3/level4/level5/level6/level7/level8/level9/')

      // Depth 11 and beyond should be skipped
      expect(listing).not.toContain('level0/level1/level2/level3/level4/level5/level6/level7/level8/level9/level10/level11/')
    })

    it('should block path traversal attacks', async () => {
      const tool = createListFiles(motorConfig)

      await expect(
        tool.execute({
          repo: 'testowner/testrepo',
          path: '../../../etc'
        })
      ).rejects.toThrow('Path traversal blocked')
    })
  })
})
