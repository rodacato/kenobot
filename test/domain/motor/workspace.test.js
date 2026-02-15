import { describe, it, expect } from 'vitest'
import { parseRepo, resolveWorkspace, sshUrl } from '../../../src/domain/motor/workspace.js'
import { join } from 'node:path'

describe('workspace', () => {
  describe('parseRepo', () => {
    it('parses valid owner/repo format', () => {
      const result = parseRepo('octocat/hello-world')
      expect(result).toEqual({ owner: 'octocat', name: 'hello-world' })
    })

    it('handles repos with dots', () => {
      const result = parseRepo('owner.name/repo.name')
      expect(result).toEqual({ owner: 'owner.name', name: 'repo.name' })
    })

    it('handles repos with hyphens', () => {
      const result = parseRepo('my-org/my-repo')
      expect(result).toEqual({ owner: 'my-org', name: 'my-repo' })
    })

    it('handles repos with underscores', () => {
      const result = parseRepo('my_org/my_repo')
      expect(result).toEqual({ owner: 'my_org', name: 'my_repo' })
    })

    it('handles repos with numbers', () => {
      const result = parseRepo('user123/repo456')
      expect(result).toEqual({ owner: 'user123', name: 'repo456' })
    })

    it('handles mixed valid characters', () => {
      const result = parseRepo('user-123_name.org/repo.name-123_test')
      expect(result).toEqual({ owner: 'user-123_name.org', name: 'repo.name-123_test' })
    })

    it('rejects empty string', () => {
      expect(() => parseRepo('')).toThrow('Invalid repo format: "". Expected "owner/repo".')
    })

    it('rejects null', () => {
      expect(() => parseRepo(null)).toThrow('Invalid repo format: "null". Expected "owner/repo".')
    })

    it('rejects undefined', () => {
      expect(() => parseRepo(undefined)).toThrow('Invalid repo format: "undefined". Expected "owner/repo".')
    })

    it('rejects format without slash', () => {
      expect(() => parseRepo('octocat')).toThrow('Invalid repo format: "octocat". Expected "owner/repo".')
    })

    it('rejects format with multiple slashes', () => {
      expect(() => parseRepo('owner/repo/extra')).toThrow('Invalid repo format: "owner/repo/extra". Expected "owner/repo".')
    })

    it('rejects path traversal attempts', () => {
      expect(() => parseRepo('../etc/passwd')).toThrow('Invalid repo format: "../etc/passwd". Expected "owner/repo".')
    })

    it('rejects path with leading slash', () => {
      expect(() => parseRepo('/owner/repo')).toThrow('Invalid repo format: "/owner/repo". Expected "owner/repo".')
    })

    it('rejects path with trailing slash', () => {
      expect(() => parseRepo('owner/repo/')).toThrow('Invalid repo format: "owner/repo/". Expected "owner/repo".')
    })

    it('rejects repo with spaces', () => {
      expect(() => parseRepo('owner name/repo name')).toThrow('Invalid repo format: "owner name/repo name". Expected "owner/repo".')
    })

    it('rejects repo with special characters', () => {
      expect(() => parseRepo('owner@name/repo#name')).toThrow('Invalid repo format: "owner@name/repo#name". Expected "owner/repo".')
    })

    it('rejects only slash', () => {
      expect(() => parseRepo('/')).toThrow('Invalid repo format: "/". Expected "owner/repo".')
    })

    it('rejects empty owner', () => {
      expect(() => parseRepo('/repo')).toThrow('Invalid repo format: "/repo". Expected "owner/repo".')
    })

    it('rejects empty repo name', () => {
      expect(() => parseRepo('owner/')).toThrow('Invalid repo format: "owner/". Expected "owner/repo".')
    })
  })

  describe('resolveWorkspace', () => {
    it('resolves correct path for valid repo', () => {
      const result = resolveWorkspace('/workspaces', 'octocat/hello-world')
      expect(result).toBe(join('/workspaces', 'octocat', 'hello-world'))
    })

    it('resolves path with nested owner directory', () => {
      const result = resolveWorkspace('/home/user/workspaces', 'my-org/my-repo')
      expect(result).toBe(join('/home/user/workspaces', 'my-org', 'my-repo'))
    })

    it('handles relative workspace directory', () => {
      const result = resolveWorkspace('./workspaces', 'owner/repo')
      expect(result).toBe(join('./workspaces', 'owner', 'repo'))
    })

    it('propagates parseRepo error for invalid format', () => {
      expect(() => resolveWorkspace('/workspaces', 'invalid')).toThrow('Invalid repo format: "invalid". Expected "owner/repo".')
    })

    it('propagates parseRepo error for path traversal', () => {
      expect(() => resolveWorkspace('/workspaces', '../etc/passwd')).toThrow('Invalid repo format: "../etc/passwd". Expected "owner/repo".')
    })

    it('propagates parseRepo error for null repo', () => {
      expect(() => resolveWorkspace('/workspaces', null)).toThrow('Invalid repo format: "null". Expected "owner/repo".')
    })

    it('resolves path with dots in repo name', () => {
      const result = resolveWorkspace('/workspaces', 'owner.name/repo.name')
      expect(result).toBe(join('/workspaces', 'owner.name', 'repo.name'))
    })
  })

  describe('sshUrl', () => {
    it('generates SSH URL for valid repo', () => {
      const result = sshUrl('octocat/hello-world')
      expect(result).toBe('git@github.com:octocat/hello-world.git')
    })

    it('generates SSH URL for repo with dots', () => {
      const result = sshUrl('owner.name/repo.name')
      expect(result).toBe('git@github.com:owner.name/repo.name.git')
    })

    it('generates SSH URL for repo with hyphens and underscores', () => {
      const result = sshUrl('my-org_name/my-repo_name')
      expect(result).toBe('git@github.com:my-org_name/my-repo_name.git')
    })

    it('throws error for invalid repo format', () => {
      expect(() => sshUrl('invalid')).toThrow('Invalid repo format: "invalid". Expected "owner/repo".')
    })

    it('throws error for path traversal in repo', () => {
      expect(() => sshUrl('../etc/passwd')).toThrow('Invalid repo format: "../etc/passwd". Expected "owner/repo".')
    })

    it('throws error for null repo', () => {
      expect(() => sshUrl(null)).toThrow('Invalid repo format: "null". Expected "owner/repo".')
    })

    it('throws error for repo with multiple slashes', () => {
      expect(() => sshUrl('owner/repo/extra')).toThrow('Invalid repo format: "owner/repo/extra". Expected "owner/repo".')
    })
  })
})
