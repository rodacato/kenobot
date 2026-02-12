import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const engineRoot = join(fileURLToPath(import.meta.url), '..', '..', '..')

function makePaths(home) {
  return {
    home,
    engine: engineRoot,
    config: join(home, 'config'),
    envFile: join(home, 'config', '.env'),
    identities: join(home, 'config', 'identities'),
    skills: join(home, 'config', 'skills'),
    tools: join(home, 'config', 'tools'),
    data: join(home, 'data'),
    backups: join(home, 'backups'),
    pidFile: join(home, 'data', 'kenobot.pid'),
    templates: join(engineRoot, 'templates'),
  }
}

/** Create a healthy installation with all dirs and valid config */
async function seedHealthy(paths) {
  const dirs = [
    paths.config,
    join(paths.config, 'identities', 'kenobot'),
    paths.skills,
    paths.tools,
    join(paths.data, 'sessions'),
    join(paths.data, 'memory'),
    join(paths.data, 'logs'),
    join(paths.data, 'scheduler'),
    paths.backups,
  ]
  for (const dir of dirs) {
    await mkdir(dir, { recursive: true })
  }

  // Valid .env
  await writeFile(paths.envFile, [
    'TELEGRAM_BOT_TOKEN=123456:ABC-DEF',
    'TELEGRAM_ALLOWED_USERS=12345678',
    'PROVIDER=mock',
  ].join('\n'))

  // Identity files (match template: SOUL.md, IDENTITY.md, USER.md, BOOTSTRAP.md)
  await writeFile(join(paths.config, 'identities', 'kenobot', 'SOUL.md'), '# Soul')
  await writeFile(join(paths.config, 'identities', 'kenobot', 'IDENTITY.md'), '# Identity')
  await writeFile(join(paths.config, 'identities', 'kenobot', 'USER.md'), '# User')
  await writeFile(join(paths.config, 'identities', 'kenobot', 'BOOTSTRAP.md'), '# Bootstrap')

  // Skills matching templates (weather + daily-summary)
  for (const skill of ['weather', 'daily-summary']) {
    await mkdir(join(paths.skills, skill), { recursive: true })
    await writeFile(join(paths.skills, skill, 'manifest.json'), JSON.stringify({
      name: skill,
      description: `${skill} skill`,
      triggers: [`/${skill}`],
    }))
    await writeFile(join(paths.skills, skill, 'SKILL.md'), `# ${skill}`)
  }

  // A valid extra skill
  await mkdir(join(paths.skills, 'test-skill'), { recursive: true })
  await writeFile(join(paths.skills, 'test-skill', 'manifest.json'), JSON.stringify({
    name: 'test-skill',
    description: 'A test skill',
    triggers: ['/test'],
  }))
  await writeFile(join(paths.skills, 'test-skill', 'SKILL.md'), '# Test Skill')

  // Memory template file
  await writeFile(join(paths.data, 'memory', 'MEMORY.md'), '# Memory')
}

// Capture console output
function captureOutput() {
  const lines = []
  const origLog = console.log
  const origErr = console.error
  console.log = (...args) => lines.push(args.join(' '))
  console.error = (...args) => lines.push(args.join(' '))
  return {
    lines,
    restore: () => { console.log = origLog; console.error = origErr },
  }
}

describe('kenobot doctor', () => {
  let tmpDir

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kenobot-doctor-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('reports all green for a healthy installation', async () => {
    const paths = makePaths(tmpDir)
    await seedHealthy(paths)

    const output = captureOutput()
    try {
      const { default: doctor } = await import('../../src/cli/doctor.js')
      await doctor([], paths)
    } finally {
      output.restore()
    }

    const text = output.lines.join('\n')
    expect(text).toContain('[✓]')
    expect(text).toContain('All checks passed')
    expect(text).not.toContain('[✗]')
  })

  it('detects missing .env file', async () => {
    const paths = makePaths(tmpDir)
    await seedHealthy(paths)
    await rm(paths.envFile)

    const output = captureOutput()
    try {
      const { default: doctor } = await import('../../src/cli/doctor.js')
      await doctor([], paths)
    } finally {
      output.restore()
    }

    const text = output.lines.join('\n')
    expect(text).toContain('[✗]')
    expect(text).toContain('.env not found')
  })

  it('detects unconfigured telegram token', async () => {
    const paths = makePaths(tmpDir)
    await seedHealthy(paths)
    await writeFile(paths.envFile, 'TELEGRAM_BOT_TOKEN=your_bot_token_here\nTELEGRAM_ALLOWED_USERS=123\nPROVIDER=mock\n')

    const output = captureOutput()
    try {
      const { default: doctor } = await import('../../src/cli/doctor.js')
      await doctor([], paths)
    } finally {
      output.restore()
    }

    const text = output.lines.join('\n')
    expect(text).toContain('TELEGRAM_BOT_TOKEN not set')
  })

  it('detects missing directories', async () => {
    const paths = makePaths(tmpDir)
    // Only create minimal structure (no data dirs)
    await mkdir(paths.config, { recursive: true })
    await writeFile(paths.envFile, 'TELEGRAM_BOT_TOKEN=abc\nTELEGRAM_ALLOWED_USERS=123\nPROVIDER=mock\n')

    const output = captureOutput()
    try {
      const { default: doctor } = await import('../../src/cli/doctor.js')
      await doctor([], paths)
    } finally {
      output.restore()
    }

    const text = output.lines.join('\n')
    expect(text).toContain('[✗]')
    expect(text).toContain('missing')
  })

  it('detects invalid skill manifest', async () => {
    const paths = makePaths(tmpDir)
    await seedHealthy(paths)

    // Add a broken skill
    const brokenSkill = join(paths.skills, 'broken')
    await mkdir(brokenSkill, { recursive: true })
    await writeFile(join(brokenSkill, 'manifest.json'), '{ not valid json }')

    const output = captureOutput()
    try {
      const { default: doctor } = await import('../../src/cli/doctor.js')
      await doctor([], paths)
    } finally {
      output.restore()
    }

    const text = output.lines.join('\n')
    expect(text).toContain('broken: invalid manifest.json')
  })

  it('detects skill missing required fields', async () => {
    const paths = makePaths(tmpDir)
    await seedHealthy(paths)

    // Add a skill with missing fields
    const incompleteSkill = join(paths.skills, 'incomplete')
    await mkdir(incompleteSkill, { recursive: true })
    await writeFile(join(incompleteSkill, 'manifest.json'), JSON.stringify({ name: 'incomplete' }))

    const output = captureOutput()
    try {
      const { default: doctor } = await import('../../src/cli/doctor.js')
      await doctor([], paths)
    } finally {
      output.restore()
    }

    const text = output.lines.join('\n')
    expect(text).toContain('incomplete: manifest missing')
  })

  it('detects stale PID file', async () => {
    const paths = makePaths(tmpDir)
    await seedHealthy(paths)

    // Write a PID that doesn't exist (99999999 is unlikely to be running)
    await writeFile(paths.pidFile, '99999999')

    const output = captureOutput()
    try {
      const { default: doctor } = await import('../../src/cli/doctor.js')
      await doctor([], paths)
    } finally {
      output.restore()
    }

    const text = output.lines.join('\n')
    expect(text).toContain('stale')
  })

  it('detects missing template files (identity, skills, memory)', async () => {
    const paths = makePaths(tmpDir)
    await seedHealthy(paths)

    // Remove BOOTSTRAP.md from identity
    await rm(join(paths.config, 'identities', 'kenobot', 'BOOTSTRAP.md'))
    // Remove weather skill entirely
    await rm(join(paths.skills, 'weather'), { recursive: true })
    // Remove MEMORY.md
    await rm(join(paths.data, 'memory', 'MEMORY.md'))

    const output = captureOutput()
    try {
      const { default: doctor } = await import('../../src/cli/doctor.js')
      await doctor([], paths)
    } finally {
      output.restore()
    }

    const text = output.lines.join('\n')
    expect(text).toContain('Template integrity')
    expect(text).toContain('missing')
    expect(text).toContain('BOOTSTRAP.md')
    expect(text).toContain('weather')
    expect(text).toContain('MEMORY.md')
  })

  it('detects missing identity directory', async () => {
    const paths = makePaths(tmpDir)
    await seedHealthy(paths)

    // Remove identity dir
    await rm(join(paths.config, 'identities', 'kenobot'), { recursive: true })

    const output = captureOutput()
    try {
      const { default: doctor } = await import('../../src/cli/doctor.js')
      await doctor([], paths)
    } finally {
      output.restore()
    }

    const text = output.lines.join('\n')
    expect(text).toContain('Identity')
    expect(text).toContain('not found')
  })

  it('analyzes recent log errors', async () => {
    const paths = makePaths(tmpDir)
    await seedHealthy(paths)

    // Create a log file with errors
    const today = new Date().toISOString().slice(0, 10)
    const logFile = join(paths.data, 'logs', `kenobot-${today}.log`)
    const logLines = [
      JSON.stringify({ level: 'info', event: 'startup' }),
      JSON.stringify({ level: 'error', event: 'provider_failed', error: 'timeout' }),
      JSON.stringify({ level: 'error', event: 'provider_failed', error: 'timeout' }),
      JSON.stringify({ level: 'info', event: 'message_out' }),
    ].join('\n')
    await writeFile(logFile, logLines)

    const output = captureOutput()
    try {
      const { default: doctor } = await import('../../src/cli/doctor.js')
      await doctor([], paths)
    } finally {
      output.restore()
    }

    const text = output.lines.join('\n')
    expect(text).toContain('2 errors today')
  })
})
