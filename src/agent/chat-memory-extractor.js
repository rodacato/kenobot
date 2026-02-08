/**
 * Chat Memory Extractor - Parses <chat-memory> tags from LLM responses
 *
 * The agent is instructed to wrap chat-specific facts in <chat-memory> tags.
 * These are stored per-chat (scoped by sessionId) rather than globally.
 *
 * @param {string} text - Raw LLM response (or post-extraction text)
 * @returns {{ cleanText: string, chatMemories: string[] }}
 */
export function extractChatMemories(text) {
  const chatMemories = []
  const cleanText = text.replace(/<chat-memory>([\s\S]*?)<\/chat-memory>/g, (_, content) => {
    const trimmed = content.trim()
    if (trimmed) chatMemories.push(trimmed)
    return ''
  })

  return {
    cleanText: cleanText.replace(/\n{3,}/g, '\n\n').trim(),
    chatMemories
  }
}
