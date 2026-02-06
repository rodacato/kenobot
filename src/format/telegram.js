/**
 * Telegram HTML Formatter
 *
 * Converts standard markdown (as output by LLMs) to Telegram-compatible HTML.
 *
 * Pattern adopted from nanobot and openclaw:
 * 1. Protect code blocks with placeholders (they contain markdown-like chars)
 * 2. Escape HTML entities in remaining text
 * 3. Convert markdown syntax → HTML tags
 * 4. Restore code blocks as <pre><code>
 *
 * Use with parse_mode: 'HTML' in Telegram Bot API.
 */

/**
 * Convert markdown text to Telegram HTML.
 * @param {string} text - Standard markdown text
 * @returns {string} Telegram-compatible HTML
 */
export function markdownToHTML(text) {
  // Step 1: Protect code blocks with null-byte placeholders
  const codeBlocks = []
  let result = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    codeBlocks.push({ lang, code })
    return `\x00CODEBLOCK${codeBlocks.length - 1}\x00`
  })

  const inlineCode = []
  result = result.replace(/`([^`]+)`/g, (_, code) => {
    inlineCode.push(code)
    return `\x00INLINE${inlineCode.length - 1}\x00`
  })

  // Step 2: Escape HTML entities in non-code text
  result = escapeHTML(result)

  // Step 3: Convert markdown → HTML tags
  result = result
    // Headers → bold (Telegram has no header support)
    .replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>')
    // Horizontal rules → visual separator
    .replace(/^---+$/gm, '———')
    // Bold **text**
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    // Italic *text* (not mid-word like 2*3*4)
    .replace(/(?<!\w)\*(.+?)\*(?!\w)/g, '<i>$1</i>')
    // Strikethrough ~~text~~
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    // Links [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

  // Step 4: Restore code blocks with proper HTML tags
  result = result.replace(/\x00INLINE(\d+)\x00/g, (_, i) =>
    `<code>${escapeHTML(inlineCode[i])}</code>`)

  result = result.replace(/\x00CODEBLOCK(\d+)\x00/g, (_, i) => {
    const { lang, code } = codeBlocks[i]
    const cls = lang ? ` class="language-${lang}"` : ''
    return `<pre><code${cls}>${escapeHTML(code)}</code></pre>`
  })

  return result
}

/**
 * Escape HTML special characters.
 * @param {string} text
 * @returns {string}
 */
function escapeHTML(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
