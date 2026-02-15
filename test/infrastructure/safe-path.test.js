import { describe, it, expect } from 'vitest'
import { safePath } from '../../src/infrastructure/safe-path.js'

describe('safePath', () => {
  const base = '/home/user/workspace'

  it('should resolve a simple relative path', () => {
    const result = safePath(base, 'notes/file.md')
    expect(result).toBe('/home/user/workspace/notes/file.md')
  })

  it('should resolve nested paths', () => {
    const result = safePath(base, 'skills/weather/SKILL.md')
    expect(result).toBe('/home/user/workspace/skills/weather/SKILL.md')
  })

  it('should allow the base directory itself', () => {
    const result = safePath(base, '.')
    expect(result).toBe('/home/user/workspace')
  })

  it('should block path traversal with ../', () => {
    expect(() => safePath(base, '../../../etc/passwd')).toThrow('Path traversal blocked')
  })

  it('should block path traversal with ../sibling', () => {
    expect(() => safePath(base, '../sibling/file')).toThrow('Path traversal blocked')
  })

  it('should block absolute paths outside base', () => {
    expect(() => safePath(base, '/etc/passwd')).toThrow('Path traversal blocked')
  })

  it('should block sneaky traversal (valid prefix but different dir)', () => {
    // /home/user/workspace-evil is not inside /home/user/workspace
    expect(() => safePath(base, '../workspace-evil/file')).toThrow('Path traversal blocked')
  })

  it('should handle traversal that resolves back inside', () => {
    const result = safePath(base, 'notes/../skills/file.md')
    expect(result).toBe('/home/user/workspace/skills/file.md')
  })

  it('should handle empty relative path', () => {
    const result = safePath(base, '')
    expect(result).toBe('/home/user/workspace')
  })
})
