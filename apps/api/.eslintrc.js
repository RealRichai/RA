module.exports = {
  extends: ['../../.eslintrc.js'],
  rules: {
    // Fastify route handlers are async but may not use await directly
    '@typescript-eslint/require-await': 'off',
    // Fastify patterns often use any types
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    // Fastify route handlers return promises that are handled by the framework
    '@typescript-eslint/no-misused-promises': 'off',
    '@typescript-eslint/no-floating-promises': 'off',
    // Allow case block declarations
    'no-case-declarations': 'off',
    // Allow unused variables - many stub implementations
    '@typescript-eslint/no-unused-vars': 'off',
    // Allow template literal expressions with unknown types
    '@typescript-eslint/restrict-template-expressions': 'off',
  },
};
