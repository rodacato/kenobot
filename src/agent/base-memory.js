/**
 * BaseMemory - Interface for memory subsystems
 *
 * Consistent with BaseProvider, BaseChannel, BaseTool, BaseStorage.
 * All memory implementations must extend this class.
 *
 * Two tiers: global (shared across all chats) and per-chat (scoped by sessionId).
 * Compaction methods enable decorators to read, merge, and clean old daily logs.
 */
export default class BaseMemory {

  // --- Global memory ---

  async appendDaily(entry) {
    throw new Error('appendDaily() must be implemented by subclass')
  }

  async getRecentDays(days = 3) {
    throw new Error('getRecentDays() must be implemented by subclass')
  }

  async getLongTermMemory() {
    throw new Error('getLongTermMemory() must be implemented by subclass')
  }

  // --- Per-chat memory ---

  async appendChatDaily(sessionId, entry) {
    throw new Error('appendChatDaily() must be implemented by subclass')
  }

  async getChatRecentDays(sessionId, days = 3) {
    throw new Error('getChatRecentDays() must be implemented by subclass')
  }

  async getChatLongTermMemory(sessionId) {
    throw new Error('getChatLongTermMemory() must be implemented by subclass')
  }

  // --- Compaction support ---

  async listDailyLogs() {
    throw new Error('listDailyLogs() must be implemented by subclass')
  }

  async readDailyLog(filename) {
    throw new Error('readDailyLog() must be implemented by subclass')
  }

  async deleteDailyLog(filename) {
    throw new Error('deleteDailyLog() must be implemented by subclass')
  }

  async writeLongTermMemory(content) {
    throw new Error('writeLongTermMemory() must be implemented by subclass')
  }
}
