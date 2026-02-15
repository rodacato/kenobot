import { describe, it, expect } from 'vitest'
import { markdownToHTML } from '../../../src/infrastructure/format/telegram.js'

describe('markdownToHTML', () => {
  describe('headers', () => {
    it('should convert h2 headers to bold', () => {
      expect(markdownToHTML('## Title')).toBe('<b>Title</b>')
    })

    it('should convert all header levels', () => {
      const input = '# H1\n## H2\n### H3\n#### H4'
      const expected = '<b>H1</b>\n<b>H2</b>\n<b>H3</b>\n<b>H4</b>'
      expect(markdownToHTML(input)).toBe(expected)
    })

    it('should not convert # inside text', () => {
      const input = 'use C# for that'
      expect(markdownToHTML(input)).toBe('use C# for that')
    })
  })

  describe('bold', () => {
    it('should convert **text** to <b>', () => {
      expect(markdownToHTML('**bold**')).toBe('<b>bold</b>')
    })

    it('should handle multiple bold segments', () => {
      expect(markdownToHTML('**one** and **two**')).toBe('<b>one</b> and <b>two</b>')
    })
  })

  describe('italic', () => {
    it('should convert *text* to <i>', () => {
      expect(markdownToHTML('*italic*')).toBe('<i>italic</i>')
    })

    it('should not convert mid-word asterisks', () => {
      expect(markdownToHTML('2*3*4')).toBe('2*3*4')
    })
  })

  describe('strikethrough', () => {
    it('should convert ~~text~~ to <s>', () => {
      expect(markdownToHTML('~~deleted~~')).toBe('<s>deleted</s>')
    })
  })

  describe('links', () => {
    it('should convert [text](url) to <a href>', () => {
      expect(markdownToHTML('[click](https://example.com)'))
        .toBe('<a href="https://example.com">click</a>')
    })
  })

  describe('inline code', () => {
    it('should convert `code` to <code>', () => {
      expect(markdownToHTML('use `npm install`')).toBe('use <code>npm install</code>')
    })

    it('should escape HTML inside inline code', () => {
      expect(markdownToHTML('try `<div>`')).toBe('try <code>&lt;div&gt;</code>')
    })

    it('should not convert markdown inside inline code', () => {
      expect(markdownToHTML('`**not bold**`')).toBe('<code>**not bold**</code>')
    })
  })

  describe('code blocks', () => {
    it('should convert fenced code blocks to <pre><code>', () => {
      const input = '```\nconst x = 1\n```'
      expect(markdownToHTML(input)).toBe('<pre><code>const x = 1\n</code></pre>')
    })

    it('should include language class when specified', () => {
      const input = '```js\nconst x = 1\n```'
      expect(markdownToHTML(input)).toBe('<pre><code class="language-js">const x = 1\n</code></pre>')
    })

    it('should escape HTML inside code blocks', () => {
      const input = '```\n<script>alert("xss")</script>\n```'
      expect(markdownToHTML(input)).toContain('&lt;script&gt;')
    })

    it('should not convert markdown inside code blocks', () => {
      const input = '```\n## not a header\n**not bold**\n```'
      const result = markdownToHTML(input)
      expect(result).not.toContain('<b>')
      expect(result).toContain('## not a header')
      expect(result).toContain('**not bold**')
    })
  })

  describe('horizontal rules', () => {
    it('should convert --- to separator', () => {
      expect(markdownToHTML('above\n---\nbelow')).toBe('above\n———\nbelow')
    })

    it('should handle longer rules', () => {
      expect(markdownToHTML('-----')).toBe('———')
    })
  })

  describe('HTML escaping', () => {
    it('should escape < and > in regular text', () => {
      expect(markdownToHTML('a < b > c')).toBe('a &lt; b &gt; c')
    })

    it('should escape & in regular text', () => {
      expect(markdownToHTML('foo & bar')).toBe('foo &amp; bar')
    })

    it('should prevent HTML injection', () => {
      const input = '<script>alert("xss")</script>'
      const result = markdownToHTML(input)
      expect(result).not.toContain('<script>')
      expect(result).toContain('&lt;script&gt;')
    })
  })

  describe('mixed formatting', () => {
    it('should handle headers with bold content', () => {
      const input = '## Cómo trabajo:\n\n- **Bold item**\n- *Italic item*'
      const result = markdownToHTML(input)
      expect(result).toContain('<b>Cómo trabajo:</b>')
      expect(result).toContain('<b>Bold item</b>')
      expect(result).toContain('<i>Italic item</i>')
    })

    it('should handle text with code and formatting', () => {
      const input = 'Use `markdownToHTML()` for **formatting**'
      const result = markdownToHTML(input)
      expect(result).toContain('<code>markdownToHTML()</code>')
      expect(result).toContain('<b>formatting</b>')
    })
  })

  describe('plain text', () => {
    it('should pass through plain text with HTML escaping only', () => {
      expect(markdownToHTML('Just plain text')).toBe('Just plain text')
    })

    it('should handle empty string', () => {
      expect(markdownToHTML('')).toBe('')
    })
  })
})
