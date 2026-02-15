/**
 * Working Memory Extractor - Parses <working-memory> tags from LLM responses
 *
 * Unlike <memory> and <chat-memory> which append entries, working memory
 * replaces the previous snapshot entirely. If multiple tags appear, the
 * last one wins (latest snapshot).
 *
 * @param {string} text - Raw LLM response
 * @returns {{ cleanText: string, workingMemory: string|null }}
 */
export function extractWorkingMemory(text) {
  let workingMemory = null
  const cleanText = text.replace(/<working-memory>([\s\S]*?)<\/working-memory>/g, (_, content) => {
    const trimmed = content.trim()
    if (trimmed) workingMemory = trimmed
    return ''
  })

  return {
    cleanText: cleanText.replace(/\n{3,}/g, '\n\n').trim(),
    workingMemory
  }
}
