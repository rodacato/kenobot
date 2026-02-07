import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import setupTunnel from '../../src/cli/setup-tunnel.js'

describe('setup-tunnel', () => {
  let tmpDir, paths

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kenobot-tunnel-'))
    paths = { home: tmpDir, config: join(tmpDir, 'config') }
    vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit') })
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('should show usage when no --domain provided', async () => {
    await expect(setupTunnel([], paths)).rejects.toThrow('process.exit')
    expect(process.exit).toHaveBeenCalledWith(1)
  })

  it('should generate cloudflared config YAML', async () => {
    // Suppress console output
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await setupTunnel(['--domain', 'bot.example.com'], paths)

    const configPath = join(paths.config, 'cloudflared.yml')
    const content = await readFile(configPath, 'utf8')
    expect(content).toContain('bot.example.com')
    expect(content).toContain('http://localhost:3000')
    expect(content).toContain('tunnel: kenobot')
  })

  it('should use custom port', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await setupTunnel(['--domain', 'bot.example.com', '--port', '8080'], paths)

    const content = await readFile(join(paths.config, 'cloudflared.yml'), 'utf8')
    expect(content).toContain('http://localhost:8080')
  })

  it('should not overwrite existing config', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})

    // Generate first time
    await setupTunnel(['--domain', 'first.example.com'], paths)
    // Generate second time — should warn, not overwrite
    await setupTunnel(['--domain', 'second.example.com'], paths)

    const content = await readFile(join(paths.config, 'cloudflared.yml'), 'utf8')
    expect(content).toContain('first.example.com')
  })
})
