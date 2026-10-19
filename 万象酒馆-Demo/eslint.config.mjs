import js from '@eslint/js';
import globals from 'globals';
export default [
  { ignores: ['vendor/**', 'dist/**', 'node_modules/**', 'assets/**', '.runtime/**', '验证/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { ecmaVersion: 'latest', globals: { ...globals.node } },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-irregular-whitespace': ['error', { skipTemplates: true }],
    },
  },
  { files: ['src/**/*.js'], languageOptions: { globals: { ...globals.browser } } },
  {
    files: ['tests/browser/**/*.{js,mjs,cjs}'],
    languageOptions: { globals: { ...globals.browser, demo: 'readonly' } },
  },
  {
    files: ['src/{engine,data,expedition,turn-flow,validation}.js'],
    rules: {
      'no-restricted-globals': ['error', 'document', 'window', 'navigator'],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'three',
            'three/*',
            './app/*',
            './scene.js',
            './ui.js',
            './effects.js',
            './motion.js',
          ],
        },
      ],
    },
  },
];
