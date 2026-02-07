/**
 * Bootstrap Extractor - Detects <bootstrap-complete/> tag in LLM responses
 *
 * The agent includes this self-closing tag when the bootstrap (first-conversation
 * onboarding) is complete. The AgentLoop uses this signal to delete BOOTSTRAP.md.
 *
 * @param {string} text - Raw LLM response (or post-extraction text)
 * @returns {{ cleanText: string, isComplete: boolean }}
 */
export function extractBootstrapComplete(text) {
  const isComplete = /<bootstrap-complete\s*\/?>/.test(text)
  const cleanText = text
    .replace(/<bootstrap-complete\s*\/?>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { cleanText, isComplete }
}
