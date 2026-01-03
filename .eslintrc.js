module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'prettier',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: ['./tsconfig.json', './apps/*/tsconfig.json', './packages/*/tsconfig.json'],
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint', 'import', 'security'],
  rules: {
    // TypeScript
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/no-misused-promises': 'error',

    // Import
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc' },
      },
    ],

    // Security - detect-object-injection disabled due to high false positive rate
    // See: https://github.com/eslint-community/eslint-plugin-security/issues/21
    'security/detect-object-injection': 'off',
    'security/detect-non-literal-regexp': 'off',
    'security/detect-possible-timing-attacks': 'warn',

    // General
    'no-console': 'warn',
    'no-debugger': 'error',
    'prefer-const': 'error',
    'no-var': 'error',

    // Persistence Guard: Block InMemory* imports from production code
    // InMemory stores are only allowed in test files (excluded via ignorePatterns)
    // and in the composition root (apps/api/src/persistence/index.ts via dynamic import)
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['**/InMemory*', '*InMemoryAttributionStore*', '*InMemoryMeteringService*'],
            message: 'InMemory stores cannot be imported in production code. Use the persistence composition root (apps/api/src/persistence) instead.',
          },
        ],
        paths: [
          {
            name: '@realriches/revenue-engine',
            importNames: ['InMemoryAttributionStore'],
            message: 'Use getAttributionStore() from apps/api/src/persistence instead of InMemoryAttributionStore.',
          },
          {
            name: '@realriches/tour-delivery',
            importNames: ['InMemoryMeteringService', 'createMeteringService'],
            message: 'Use getMeteringService() from apps/api/src/persistence instead of InMemoryMeteringService.',
          },
          {
            name: '@realriches/workflows',
            importNames: ['InMemoryActivityCache', 'InMemorySignalStore'],
            message: 'InMemory workflow stores are for testing only. Use Redis-backed implementations in production.',
          },
          {
            name: '@realriches/agent-governance',
            importNames: ['InMemoryTaskQueue', 'InMemoryOutcomeRecorder', 'InMemoryGradingStore', 'InMemoryRecordingStorage', 'InMemoryAgentRunStore'],
            message: 'InMemory agent stores are for testing only. Use database-backed implementations in production.',
          },
          {
            name: '@realriches/email-service',
            importNames: ['InMemoryNotificationLogger'],
            message: 'InMemory notification logger is for testing only. Use database-backed implementation in production.',
          },
        ],
      },
    ],
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    '.next/',
    'coverage/',
    '*.js',
    'vitest.config.ts',
    'vitest.*.config.ts',
    '*.test.ts',
    '**/tests/**',
    '**/prisma/seed.ts',
    'tailwind.config.ts',
  ],
};
