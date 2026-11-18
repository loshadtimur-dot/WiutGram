import js from '@eslint/js';
import globals from 'globals';

const common = {
  ecmaVersion: 2023,
  sourceType: 'commonjs'
};

const unused = {
  'no-unused-vars': [
    'error',
    { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_', ignoreRestSiblings: true }
  ]
};

export default [
  {
    ignores: [
      'node_modules/**',
      'data/**',
      'uploads/**',
      'storage/**',
      'backups/**',
      'screenshots/**',
      '*.min.js'
    ]
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ...common, globals: { ...globals.node } },
    rules: { ...unused, 'no-console': 'off' }
  },
  {
    files: ['public/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser } },
    // Unused imports in UI pages are reported but do not block: they are dead
    // weight, not defects. Server code keeps this as an error.
    rules: { ...unused, 'no-unused-vars': ['warn', unused['no-unused-vars'][1]] }
  },
  {
    files: ['eslint.config.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } }
  },
  {
    files: ['public/sw.js', 'tests/e2e.test.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.node, ...globals.serviceworker } }
  }
];
