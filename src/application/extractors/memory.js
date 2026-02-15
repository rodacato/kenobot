/**
 * Memory Extractor - Parses <memory> tags from LLM responses
 *
 * The agent is instructed to wrap things worth remembering in <memory> tags.
 * This module extracts them and returns clean text for the user.
 *
 * @param {string} text - Raw LLM response
 * @returns {{ cleanText: string, memories: string[] }}
 */
export function extractMemories(text) {
  const memories = []
  const cleanText = text.replace(/<memory>([\s\S]*?)<\/memory>/g, (_, content) => {
    const trimmed = content.trim()
    if (trimmed) memories.push(trimmed)
    return ''
  })

  return {
    cleanText: cleanText.replace(/\n{3,}/g, '\n\n').trim(),
    memories
  }
}
