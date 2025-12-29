module.exports = {
  extends: ['../../.eslintrc.js'],
  rules: {
    // These functions are intentionally async for consistency
    '@typescript-eslint/require-await': 'off',
    // Allow any for dynamic type handling
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    // Floating promises are intentionally fire-and-forget for background processing
    '@typescript-eslint/no-floating-promises': 'off',
  },
};
