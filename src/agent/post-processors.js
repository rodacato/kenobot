import { extractMemories } from './memory-extractor.js'
import { extractChatMemories } from './chat-memory-extractor.js'
import { extractUserUpdates } from './user-extractor.js'
import { extractBootstrapComplete } from './bootstrap-extractor.js'
import { CONFIG_CHANGED } from '../events.js'

/**
 * Post-processor pipeline for agent responses.
 *
 * Each processor extracts tagged content from the response text and
 * persists it. The pipeline chains: each processor receives the clean
 * text from the previous one, and returns its own cleaned output.
 *
 * Adding a new post-processor (e.g. sentiment analysis, language
 * detection) = one entry here, zero edits to AgentLoop.
 */
export const defaultPostProcessors = [
  {
    name: 'memory',
    extract(text) {
      const { cleanText, memories } = extractMemories(text)
      return { cleanText, data: { memories } }
    },
    async apply({ memories }, { memory, bus }) {
      if (!memory || memories.length === 0) return
      for (const entry of memories) await memory.appendDaily(entry)
      bus.emit(CONFIG_CHANGED, { reason: 'memory update' })
    }
  },
  {
    name: 'chat-memory',
    extract(text) {
      const { cleanText, chatMemories } = extractChatMemories(text)
      return { cleanText, data: { chatMemories } }
    },
    async apply({ chatMemories }, { memory, bus, sessionId }) {
      if (!memory || chatMemories.length === 0) return
      for (const entry of chatMemories) await memory.appendChatDaily(sessionId, entry)
      bus.emit(CONFIG_CHANGED, { reason: 'chat memory update' })
    }
  },
  {
    name: 'user',
    extract(text) {
      const { cleanText, updates } = extractUserUpdates(text)
      return { cleanText, data: { updates } }
    },
    async apply({ updates }, { identityLoader, bus }) {
      if (updates.length === 0 || !identityLoader) return
      await identityLoader.appendUser(updates)
      bus.emit(CONFIG_CHANGED, { reason: 'user preferences update' })
    }
  },
  {
    name: 'bootstrap',
    extract(text) {
      const { cleanText, isComplete } = extractBootstrapComplete(text)
      return { cleanText, data: { isComplete } }
    },
    async apply({ isComplete }, { identityLoader, bus }) {
      if (!isComplete || !identityLoader) return
      await identityLoader.deleteBootstrap()
      bus.emit(CONFIG_CHANGED, { reason: 'bootstrap complete' })
    }
  }
]

/**
 * Run the post-processor pipeline on response text.
 * Returns clean text and aggregated extraction stats.
 */
export async function runPostProcessors(text, deps, processors = defaultPostProcessors) {
  let cleanText = text
  const stats = {}

  for (const pp of processors) {
    const { cleanText: nextText, data } = pp.extract(cleanText)
    cleanText = nextText
    stats[pp.name] = data
    await pp.apply(data, deps)
  }

  return { cleanText, stats }
}
