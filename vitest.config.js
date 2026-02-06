import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Use globals (describe, it, expect) without imports
    globals: true,

    // Node environment
    environment: 'node',

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'test/**',
        '*.config.js',
        '.githooks/**',
        'docs/**',
        'node_modules/**'
      ],
      // Thresholds for Phase 0 (will increase in Phase 1)
      thresholds: {
        lines: 50,
        functions: 35,
        branches: 55,
        statements: 50
      }
    },

    // Test match patterns
    include: ['test/**/*.test.js'],

    // Timeout for async tests
    testTimeout: 10000
  }
})
