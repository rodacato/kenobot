import boundaries from 'eslint-plugin-boundaries'

export default [
  {
    files: ['src/**/*.js'],
    ignores: ['src/cli/**'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'domain', pattern: 'src/domain', mode: 'folder' },
        { type: 'application', pattern: 'src/application', mode: 'folder' },
        { type: 'adapters', pattern: 'src/adapters', mode: 'folder' },
        { type: 'infrastructure', pattern: 'src/infrastructure', mode: 'folder' },
        { type: 'root', pattern: 'src/*.js', mode: 'file' },
      ],
      'boundaries/ignore': ['**/*.test.js'],
    },
    rules: {
      'boundaries/element-types': ['error', {
        default: 'disallow',
        rules: [
          // domain/ → only infrastructure/ (logger, events) and itself
          { from: 'domain', allow: ['domain', 'infrastructure'] },

          // application/ → domain/ and infrastructure/, not adapters/
          { from: 'application', allow: ['application', 'domain', 'infrastructure'] },

          // adapters/ → only infrastructure/ and itself, not domain/ or application/
          { from: 'adapters', allow: ['adapters', 'infrastructure'] },

          // infrastructure/ → only itself (no upward dependencies)
          { from: 'infrastructure', allow: ['infrastructure'] },

          // root files (app.js, index.js) → everything (composition root)
          { from: 'root', allow: ['domain', 'application', 'adapters', 'infrastructure', 'root'] },
        ],
      }],
    },
  },
]
