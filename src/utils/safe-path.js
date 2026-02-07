import { resolve } from 'node:path'

/**
 * Resolve a user-provided path safely within a base directory.
 * Blocks path traversal attacks (../, absolute paths, etc.)
 *
 * @param {string} base - Trusted base directory (must be absolute)
 * @param {string} userPath - Untrusted user-provided path
 * @returns {string} Resolved absolute path guaranteed to be within base
 * @throws {Error} If resolved path escapes the base directory
 */
export function safePath(base, userPath) {
  const resolvedBase = resolve(base)
  const resolved = resolve(resolvedBase, userPath)

  if (resolved !== resolvedBase && !resolved.startsWith(resolvedBase + '/')) {
    throw new Error(`Path traversal blocked: ${userPath}`)
  }

  return resolved
}
