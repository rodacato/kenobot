/**
 * BaseMemory - Interface for memory subsystems
 *
 * Consistent with BaseProvider, BaseChannel, BaseTool, BaseStorage.
 * All memory implementations must extend this class.
 */
export default class BaseMemory {
  async appendDaily(entry) {
    throw new Error('appendDaily() must be implemented by subclass')
  }

  async getRecentDays(days = 3) {
    throw new Error('getRecentDays() must be implemented by subclass')
  }

  async getLongTermMemory() {
    throw new Error('getLongTermMemory() must be implemented by subclass')
  }
}
