/**
 * BaseStorage - Interface for persistence backends
 *
 * All storage implementations must implement this interface.
 * Allows swapping from filesystem to SQLite without changing agent code.
 */
export default class BaseStorage {
  /**
   * Load conversation session messages
   * @param {string} sessionId - e.g. "telegram-123456789"
   * @param {number} limit - Max messages to return (default 20, from tail)
   * @returns {Promise<Array<{role: string, content: string, timestamp: number}>>}
   */
  async loadSession(sessionId, limit = 20) {
    throw new Error('loadSession() must be implemented by subclass')
  }

  /**
   * Append messages to a session (append-only, never overwrite)
   * @param {string} sessionId
   * @param {Array<{role: string, content: string, timestamp: number}>} messages
   */
  async saveSession(sessionId, messages) {
    throw new Error('saveSession() must be implemented by subclass')
  }

  /**
   * Read a file's contents (for identity, skills, etc.)
   * @param {string} filePath
   * @returns {Promise<string>}
   */
  async readFile(filePath) {
    throw new Error('readFile() must be implemented by subclass')
  }

  /**
   * Storage name for logging
   * @returns {string}
   */
  get name() {
    throw new Error('name getter must be implemented by subclass')
  }
}
