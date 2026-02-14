import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    configure: vi.fn(),
  },
  Logger: class MockLogger {
    constructor() {
      this.info = vi.fn()
      this.warn = vi.fn()
      this.error = vi.fn()
      this.configure = vi.fn()
    }
  }
}))

import { createApp } from '../src/app.js'

describe('createApp', () => {
  let config, provider

  beforeEach(() => {
    config = {
      provider: 'mock',
      model: 'test',
      dataDir: '/tmp/kenobot-test',
      skillsDir: './skills',
      maxToolIterations: 5,
      watchdogInterval: 60000,
      circuitBreaker: { threshold: 5, cooldown: 60000 },
      telegram: {
        token: 'test-token',
        allowedUsers: ['123'],
        allowedChatIds: [],
      },
      n8n: {},
      configRepo: '',
      sshKeyPath: '',
      workspaceDir: '',
      http: { enabled: false },
    }

    provider = {
      name: 'mock',
      chat: vi.fn(),
      chatWithRetry: vi.fn(),
      getStatus: vi.fn(() => ({ state: 'CLOSED', failures: 0 })),
    }
  })

  it('should return an app object with expected shape', () => {
    const app = createApp(config, provider)

    expect(app).toHaveProperty('bus')
    expect(app).toHaveProperty('agent')
    expect(app).toHaveProperty('channels')
    expect(app).toHaveProperty('watchdog')
    expect(app).toHaveProperty('scheduler')
    expect(app).toHaveProperty('circuitBreaker')
    expect(app).toHaveProperty('storage')
    expect(app).toHaveProperty('memory')
    expect(typeof app.start).toBe('function')
    expect(typeof app.stop).toBe('function')
  })

  it('should create a fresh NervousSystem per instance', () => {
    const app1 = createApp(config, provider)
    const app2 = createApp(config, provider)

    expect(app1.bus).not.toBe(app2.bus)
  })

  it('should have isolated buses between instances', () => {
    const app1 = createApp(config, provider)
    const app2 = createApp(config, provider)

    const spy = vi.fn()
    app1.bus.on('test', spy)
    app2.bus.emit('test')

    expect(spy).not.toHaveBeenCalled()
  })

  it('should create Telegram channel by default', () => {
    const app = createApp(config, provider)

    expect(app.channels).toHaveLength(1)
  })

  it('should throw if HTTP enabled without webhook secret', () => {
    config.http = { enabled: true, webhookSecret: '', port: 3000, host: '127.0.0.1' }

    expect(() => createApp(config, provider)).toThrow('WEBHOOK_SECRET')
  })

  it('should create HTTP channel when properly configured', () => {
    config.http = { enabled: true, webhookSecret: 'secret', port: 3000, host: '127.0.0.1' }

    const app = createApp(config, provider)

    expect(app.channels).toHaveLength(2)
  })

  it('should wrap provider with circuit breaker', () => {
    const app = createApp(config, provider)

    expect(app.circuitBreaker).toBeDefined()
    expect(app.circuitBreaker).not.toBe(provider)
  })


  it('should create isolated loggers per instance', () => {
    const app1 = createApp(config, provider)
    const app2 = createApp(config, provider)

    expect(app1.logger).not.toBe(app2.logger)
  })

  it('should expose logger on the returned app object', () => {
    const app = createApp(config, provider)

    expect(app.logger).toBeDefined()
    expect(typeof app.logger.info).toBe('function')
    expect(typeof app.logger.warn).toBe('function')
    expect(typeof app.logger.error).toBe('function')
    expect(typeof app.logger.configure).toBe('function')
  })

  it('should pass logger to agent and other components', () => {
    const app = createApp(config, provider)

    expect(app.agent.logger).toBe(app.logger)
    expect(app.watchdog.logger).toBe(app.logger)
    expect(app.scheduler.logger).toBe(app.logger)
    expect(app.storage.logger).toBe(app.logger)
    expect(app.memory.logger).toBe(app.logger)
  })
})
