module.exports = {
  extends: ['../../.eslintrc.js'],
  rules: {
    // Console is allowed for signature service logging
    'no-console': 'off',
    // Allow any types in provider interfaces
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    // Many methods are async for future implementation
    '@typescript-eslint/require-await': 'off',
    // Fire-and-forget patterns are intentional
    '@typescript-eslint/no-floating-promises': 'off',
  },
};
