/**
 * SecretScanner - Detects credentials and secrets in text
 *
 * Extracted from the pre-commit hook into a reusable, testable module.
 * Used by:
 * - github_setup_workspace (generates pre-commit hook)
 * - Future: commit validation, file scanning
 */

export const SECRET_PATTERNS = [
  {
    name: 'AWS Access Key',
    regex: /AKIA[0-9A-Z]{16}/,
    grep: 'AKIA[0-9A-Z]{16}'
  },
  {
    name: 'GitHub Token',
    regex: /gh[ps]_[A-Za-z0-9_]{36,}/,
    grep: 'gh[ps]_[A-Za-z0-9_]{36,}'
  },
  {
    name: 'GitHub PAT',
    regex: /github_pat_[A-Za-z0-9_]{22,}/,
    grep: 'github_pat_[A-Za-z0-9_]{22,}'
  },
  {
    name: 'Private Key',
    regex: /-----BEGIN\s+(RSA|EC|DSA|OPENSSH)?\s*PRIVATE KEY-----/,
    grep: '-----BEGIN[[:space:]]+(RSA|EC|DSA|OPENSSH)?[[:space:]]*PRIVATE KEY-----'
  },
  {
    name: 'Generic Secret',
    regex: /(secret|password|token|key)\s*[:=]\s*['"][A-Za-z0-9+/=]{32,}['"]/i,
    grep: '(secret|password|token|key)[[:space:]]*[:=][[:space:]]*[\'""][A-Za-z0-9+/=]{32,}[\'"]'
  }
]

/**
 * Scan text for secret patterns.
 *
 * @param {string} text - Text to scan
 * @returns {Array<{name: string, match: string}>} Findings (empty if clean)
 */
export function scanForSecrets(text) {
  const findings = []

  for (const { name, regex } of SECRET_PATTERNS) {
    const match = text.match(regex)
    if (match) {
      findings.push({ name, match: match[0] })
    }
  }

  return findings
}

/**
 * Generate a pre-commit hook script from SECRET_PATTERNS.
 *
 * Single source of truth — the hook is generated from the same patterns
 * used by scanForSecrets(), ensuring consistency.
 *
 * @returns {string} Shell script content
 */
export function generatePreCommitHook() {
  const checks = SECRET_PATTERNS.map(
    ({ name, grep }) => `check_pattern '${grep}' '${name}'`
  ).join('\n')

  return `#!/bin/sh
# KenoBot secret scanner — blocks commits containing credentials
diff=$(git diff --cached -U0)

check_pattern() {
  if echo "$diff" | grep -qE "$1"; then
    echo "ERROR: Potential secret detected ($2)"
    echo "Review staged changes and remove sensitive data before committing."
    exit 1
  fi
}

${checks}
`
}
