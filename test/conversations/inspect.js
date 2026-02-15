import { readFile, access } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Create a state inspector for a test harness.
 * Read-only helpers for checking memory, identity, sessions after each turn.
 *
 * All read methods return empty string/null on ENOENT rather than throwing,
 * so assertions stay clean (no try/catch needed in tests).
 *
 * @param {Object} harness - From createTestApp()
 * @returns {Object} Inspector methods
 */
export function createInspector(harness) {
  const { dataDir, app, provider } = harness
  const memoryDir = join(dataDir, 'memory')
  const identityDir = join(dataDir, 'memory', 'identity')
  const sessionsDir = join(dataDir, 'sessions')

  async function safeRead(path) {
    try {
      return await readFile(path, 'utf8')
    } catch {
      return ''
    }
  }

  return {
    // --- Memory ---

    /** Read today's (or specific date's) global daily log. */
    async getDailyLog(date) {
      const d = date || new Date().toISOString().slice(0, 10)
      return safeRead(join(memoryDir, `${d}.md`))
    },

    /** Read global long-term memory (MEMORY.md). */
    async getLongTermMemory() {
      return safeRead(join(memoryDir, 'MEMORY.md'))
    },

    /** Read chat-specific daily log. */
    async getChatDailyLog(sessionId, date) {
      const d = date || new Date().toISOString().slice(0, 10)
      return safeRead(join(memoryDir, 'chats', sessionId, `${d}.md`))
    },

    /** Read chat-specific long-term memory. */
    async getChatLongTermMemory(sessionId) {
      return safeRead(join(memoryDir, 'chats', sessionId, 'MEMORY.md'))
    },

    /** Read working memory content for a session. */
    async getWorkingMemory(sessionId) {
      const content = await safeRead(join(memoryDir, 'working', `${sessionId}.md`))
      return content || null
    },

    // --- Identity ---

    /** Read preferences.md content. */
    async getPreferences() {
      return safeRead(join(identityDir, 'preferences.md'))
    },

    /** Check if BOOTSTRAP.md exists (bootstrap still active). */
    async isBootstrapping() {
      try {
        await access(join(identityDir, 'BOOTSTRAP.md'))
        return true
      } catch {
        return false
      }
    },

    // --- Sessions ---

    /** Read session history as parsed entries. */
    async getSessionHistory(sessionId) {
      const raw = await safeRead(join(sessionsDir, `${sessionId}.jsonl`))
      if (!raw) return []
      return raw.trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
    },

    // --- Provider context ---

    /** Get the system prompt from the last provider call. */
    getLastSystemPrompt() {
      return provider.lastCall?.options?.system || ''
    },

    /** Get the full last call { messages, options }. */
    getLastProviderCall() {
      return provider.lastCall
    },

    // --- Procedural memory ---

    /** Read procedural patterns (patterns.json). Returns array or empty array. */
    async getProceduralPatterns() {
      const raw = await safeRead(join(memoryDir, 'procedural', 'patterns.json'))
      if (!raw) return []
      try { return JSON.parse(raw) } catch { return [] }
    },

    // --- Utilities ---

    /**
     * Convert a chatId to the full session ID used internally.
     * HTTP channel prefixes with "http-", and the channel name is "http",
     * so session IDs are "http-http-{chatId}".
     */
    sessionId(chatId) {
      return `http-http-${chatId}`
    },

    /** Direct access to data directory path. */
    get dataDir() {
      return dataDir
    }
  }
}
