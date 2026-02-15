import { createTestApp } from '../e2e/harness.js'
import { createInspector } from './inspect.js'

/**
 * Run a conversation scenario against an isolated test app.
 *
 * Creates a fresh app with MockProvider, sends each turn's message,
 * scripts the provider response, and runs assertions. Cleans up on exit.
 *
 * @param {Object} scenario - Scenario definition
 * @param {string} scenario.name - Unique scenario name (used as chatId slug)
 * @param {Function} [scenario.setup] - Pre-start hook: async ({ dataDir, identityDir, sessionsDir }) => {}
 * @param {Object} [scenario.config] - Config overrides for createTestApp
 * @param {Array} scenario.turns - Array of turn definitions
 * @param {string} scenario.turns[].user - User message text
 * @param {string} [scenario.turns[].response] - Mock provider response (scripted)
 * @param {string} [scenario.turns[].chatId] - Override chatId for this turn (multi-chat scenarios)
 * @param {Function} [scenario.turns[].assert] - Assertion callback: async ({ result, state, provider, sessionId }) => {}
 * @param {Object} [options] - Runner options
 * @param {string} [options.chatId] - Override chat ID (default: slugified scenario name)
 * @returns {Promise<{ turns: Array }>}
 */
export async function runScenario(scenario, options = {}) {
  const defaultChatId = options.chatId || slugify(scenario.name)

  const harness = await createTestApp(scenario.config || {}, {
    setup: scenario.setup
  })

  const state = createInspector(harness)
  const results = []

  try {
    for (const turn of scenario.turns) {
      // Script the mock provider response for this turn
      if (turn.response) {
        harness.provider.setNextResponse(turn.response)
      }

      // Per-turn chatId override for multi-chat scenarios
      const chatId = turn.chatId || defaultChatId
      const sessionId = state.sessionId(chatId)

      // Send the user message
      const result = await harness.sendMessage(turn.user, chatId)

      results.push({ result, turn })

      // Run assertions if provided
      if (turn.assert) {
        await turn.assert({
          result,
          state,
          provider: harness.provider,
          sessionId
        })
      }
    }
  } finally {
    await harness.cleanup()
  }

  return { turns: results }
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
