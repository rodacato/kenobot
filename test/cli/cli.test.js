import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const CLI = join(import.meta.dirname, '..', '..', 'src', 'cli.js')

function run(args = [], env = {}) {
  return execFileSync('node', [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 5000,
  })
}

function runFail(args = [], env = {}) {
  try {
    execFileSync('node', [CLI, ...args], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
      timeout: 5000,
    })
    throw new Error('Expected command to fail')
  } catch (err) {
    return err.stderr
  }
}

describe('cli', () => {
  it('shows help by default (no args)', () => {
    const output = run()
    expect(output).toContain('Usage: kenobot')
    expect(output).toContain('Commands:')
  })

  it('shows help with help subcommand', () => {
    const output = run(['help'])
    expect(output).toContain('Usage: kenobot')
  })

  it('shows version', () => {
    const output = run(['version'])
    expect(output).toMatch(/^kenobot v\d+\.\d+\.\d+/)
  })

  it('exits with error for unknown command', () => {
    const stderr = runFail(['nonexistent'])
    expect(stderr).toContain('Unknown command: nonexistent')
  })
})
