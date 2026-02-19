/**
 * Lightweight route dispatcher — no dependencies.
 *
 * Routes are defined as { method, pattern: RegExp (with named groups), handler }.
 * Method '*' matches any HTTP method.
 *
 * Usage:
 *   const router = createRouter([
 *     { method: 'GET', pattern: /^\/api\/v1\/conversations\/(?<id>[^/]+)$/, handler: fn }
 *   ])
 *   const match = router('GET', '/api/v1/conversations/abc')
 *   // → { handler: fn, params: { id: 'abc' } }  or null
 */

/**
 * Build a route-matching function from a route table.
 *
 * @param {Array<{method: string, pattern: RegExp, handler: Function}>} routes
 * @returns {(method: string, pathname: string) => {handler: Function, params: Object} | null}
 */
export function createRouter(routes) {
  return function route(method, pathname) {
    for (const r of routes) {
      if (r.method !== method && r.method !== '*') continue
      const match = r.pattern.exec(pathname)
      if (match) return { handler: r.handler, params: match.groups || {} }
    }
    return null
  }
}

/**
 * Convert an Express-style path string to a RegExp with named groups.
 * Supports :param segments.
 *
 * Examples:
 *   '/api/v1/conversations'         → /^\/api\/v1\/conversations$/
 *   '/api/v1/conversations/:id'     → /^\/api\/v1\/conversations\/(?<id>[^/]+)$/
 *
 * @param {string} path
 * @returns {RegExp}
 */
export function pathToRegex(path) {
  const pattern = path
    .replace(/\//g, '\\/')
    .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '(?<$1>[^/]+)')
  return new RegExp(`^${pattern}$`)
}
