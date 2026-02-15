/**
 * Chat Context Extractor - Parses <chat-context> tags from LLM responses
 *
 * Like working-memory, chat context replaces the previous value entirely.
 * If multiple tags appear, the last one wins (latest description).
 *
 * Storage: data/memory/chats/{sessionId}/context.md
 *
 * @param {string} text - Raw LLM response
 * @returns {{ cleanText: string, chatContext: string|null }}
 */
export function extractChatContext(text) {
  let chatContext = null
  const cleanText = text.replace(/<chat-context>([\s\S]*?)<\/chat-context>/g, (_, content) => {
    const trimmed = content.trim()
    if (trimmed) chatContext = trimmed
    return ''
  })

  return {
    cleanText: cleanText.replace(/\n{3,}/g, '\n\n').trim(),
    chatContext
  }
}
