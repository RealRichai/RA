module.exports = {
  extends: ['../../.eslintrc.js'],
  rules: {
    // These functions are intentionally async for future database integration
    '@typescript-eslint/require-await': 'off',
    // Allow any for flexible rule input types
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
  },
};
