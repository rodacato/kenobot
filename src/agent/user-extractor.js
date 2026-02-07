/**
 * User Extractor - Parses <user> tags from LLM responses
 *
 * The agent is instructed to wrap user preferences in <user> tags.
 * This module extracts them and returns clean text for the user.
 *
 * @param {string} text - Raw LLM response (or post-memory-extraction text)
 * @returns {{ cleanText: string, updates: string[] }}
 */
export function extractUserUpdates(text) {
  const updates = []
  const cleanText = text.replace(/<user>([\s\S]*?)<\/user>/g, (_, content) => {
    const trimmed = content.trim()
    if (trimmed) updates.push(trimmed)
    return ''
  })

  return {
    cleanText: cleanText.replace(/\n{3,}/g, '\n\n').trim(),
    updates
  }
}
