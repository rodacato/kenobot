import { describe, it, expect } from 'vitest'
import { scanForSecrets, generatePreCommitHook, SECRET_PATTERNS } from '../../../src/domain/immune/secret-scanner.js'

describe('SecretScanner', () => {
  describe('SECRET_PATTERNS', () => {
    it('should have 5 patterns', () => {
      expect(SECRET_PATTERNS.length).toBe(5)
    })

    it('should have name, regex, and grep for each pattern', () => {
      for (const pattern of SECRET_PATTERNS) {
        expect(pattern.name).toBeTruthy()
        expect(pattern.regex).toBeInstanceOf(RegExp)
        expect(typeof pattern.grep).toBe('string')
      }
    })
  })

  describe('scanForSecrets', () => {
    it('should detect AWS access keys', () => {
      const findings = scanForSecrets('config = AKIAIOSFODNN7EXAMPLE')
      expect(findings.length).toBe(1)
      expect(findings[0].name).toBe('AWS Access Key')
      expect(findings[0].match).toBe('AKIAIOSFODNN7EXAMPLE')
    })

    it('should detect GitHub OAuth tokens', () => {
      const findings = scanForSecrets('token = ghs_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij')
      expect(findings.length).toBe(1)
      expect(findings[0].name).toBe('GitHub Token')
    })

    it('should detect GitHub PATs', () => {
      const findings = scanForSecrets('pat = github_pat_ABCDEFGHIJKLMNOPQRSTUVw')
      expect(findings.length).toBe(1)
      expect(findings[0].name).toBe('GitHub PAT')
    })

    it('should detect private keys', () => {
      const findings = scanForSecrets('-----BEGIN RSA PRIVATE KEY-----\nMIIE...')
      expect(findings.length).toBe(1)
      expect(findings[0].name).toBe('Private Key')
    })

    it('should detect OpenSSH private keys', () => {
      const findings = scanForSecrets('-----BEGIN OPENSSH PRIVATE KEY-----\nb3Bl...')
      expect(findings.length).toBe(1)
      expect(findings[0].name).toBe('Private Key')
    })

    it('should detect generic secrets (key=value)', () => {
      const findings = scanForSecrets('secret="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg"')
      expect(findings.length).toBe(1)
      expect(findings[0].name).toBe('Generic Secret')
    })

    it('should detect multiple secrets in same text', () => {
      const text = `
        aws_key = AKIAIOSFODNN7EXAMPLE
        gh_token = ghs_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij
      `
      const findings = scanForSecrets(text)
      expect(findings.length).toBe(2)
    })

    it('should return empty array for clean text', () => {
      const findings = scanForSecrets('const x = 42; console.log("hello world")')
      expect(findings).toEqual([])
    })

    it('should return empty array for empty string', () => {
      expect(scanForSecrets('')).toEqual([])
    })

    it('should not false-positive on short values', () => {
      const findings = scanForSecrets('token="short"')
      expect(findings).toEqual([])
    })
  })

  describe('generatePreCommitHook', () => {
    it('should generate valid shell script', () => {
      const hook = generatePreCommitHook()
      expect(hook).toMatch(/^#!\/bin\/sh/)
    })

    it('should include kenobot header comment', () => {
      const hook = generatePreCommitHook()
      expect(hook).toContain('KenoBot secret scanner')
    })

    it('should use git diff --cached', () => {
      const hook = generatePreCommitHook()
      expect(hook).toContain('git diff --cached -U0')
    })

    it('should contain check_pattern function', () => {
      const hook = generatePreCommitHook()
      expect(hook).toContain('check_pattern()')
      expect(hook).toContain('grep -qE')
    })

    it('should include all secret pattern names', () => {
      const hook = generatePreCommitHook()
      for (const { name } of SECRET_PATTERNS) {
        expect(hook).toContain(name)
      }
    })

    it('should include all grep patterns', () => {
      const hook = generatePreCommitHook()
      for (const { grep } of SECRET_PATTERNS) {
        expect(hook).toContain(grep)
      }
    })
  })
})
