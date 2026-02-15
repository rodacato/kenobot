import { extractMemories } from './extractors/memory.js'
import { extractChatMemories } from './extractors/chat-memory.js'
import { extractWorkingMemory } from './extractors/working-memory.js'
import { extractChatContext } from './extractors/chat-context.js'
import { extractUserUpdates } from './extractors/user.js'
import { extractBootstrapComplete } from './extractors/bootstrap.js'
import { CONFIG_CHANGED } from '../infrastructure/events.js'
import defaultLogger from '../infrastructure/logger.js'

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
      for (const entry of memories) await memory.addFact(entry)
      bus.fire(CONFIG_CHANGED, { reason: 'memory update' }, { source: 'post-processor' })
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
      for (const entry of chatMemories) await memory.addChatFact(sessionId, entry)
      bus.fire(CONFIG_CHANGED, { reason: 'chat memory update' }, { source: 'post-processor' })
    }
  },
  {
    name: 'chat-context',
    extract(text) {
      const { cleanText, chatContext } = extractChatContext(text)
      return { cleanText, data: { chatContext } }
    },
    async apply({ chatContext }, { memory, sessionId }) {
      if (!memory || !chatContext || !sessionId) return
      await memory.setChatContext(sessionId, chatContext)
    }
  },
  {
    name: 'working-memory',
    extract(text) {
      const { cleanText, workingMemory } = extractWorkingMemory(text)
      return { cleanText, data: { workingMemory } }
    },
    async apply({ workingMemory }, { memory, sessionId }) {
      if (!memory || !workingMemory || !sessionId) return
      await memory.replaceWorkingMemory(sessionId, workingMemory)
    }
  },
  {
    name: 'user',
    extract(text) {
      const { cleanText, updates } = extractUserUpdates(text)
      return { cleanText, data: { updates } }
    },
    async apply({ updates }, { cognitive, bus }) {
      if (updates.length === 0 || !cognitive) return
      const identityManager = cognitive.getIdentityManager()
      // Save each update as a preference
      for (const update of updates) {
        await identityManager.updatePreference('learned', update)
      }
      bus.fire(CONFIG_CHANGED, { reason: 'user preferences update' }, { source: 'post-processor' })
    }
  },
  {
    name: 'bootstrap',
    extract(text) {
      const { cleanText, isComplete } = extractBootstrapComplete(text)
      return { cleanText, data: { isComplete } }
    },
    async apply({ isComplete }, { cognitive, bus }) {
      if (!isComplete || !cognitive) return
      const identityManager = cognitive.getIdentityManager()
      if (!await identityManager.hasPreferences()) {
        await identityManager.saveBootstrapPreferences()
      }
      await identityManager.deleteBootstrap()
      bus.fire(CONFIG_CHANGED, { reason: 'bootstrap complete' }, { source: 'post-processor' })
    }
  },
  {
    name: 'metacognition',
    extract(text) {
      // Observe-only: no tags to extract, pass text through unchanged
      return { cleanText: text, data: { responseText: text } }
    },
    async apply({ responseText }, { cognitive, userMessage, logger }) {
      if (!cognitive) return
      const metacognition = cognitive.getMetacognition()
      if (!metacognition) return

      const evaluation = metacognition.evaluateResponse(responseText, {
        userMessage,
        hadMemory: true
      })

      if (evaluation.quality === 'poor') {
        const log = logger || defaultLogger
        log.warn('metacognition', 'poor_response_quality', {
          quality: evaluation.quality,
          score: evaluation.score,
          signals: evaluation.signals
        })
      }
    }
  }
]

/**
 * Run the post-processor pipeline on response text.
 * Returns clean text and aggregated extraction stats.
 */
export async function runPostProcessors(text, deps, processors = defaultPostProcessors) {
  const logger = deps.logger || defaultLogger
  let cleanText = text
  const stats = {}

  for (const pp of processors) {
    const { cleanText: nextText, data } = pp.extract(cleanText)
    cleanText = nextText
    stats[pp.name] = data
    try {
      await pp.apply(data, deps)
    } catch (error) {
      logger.error('post-processor', 'apply_failed', { name: pp.name, error: error.message })
    }
  }

  return { cleanText, stats }
}
