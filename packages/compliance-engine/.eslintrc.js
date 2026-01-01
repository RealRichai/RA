module.exports = {
  extends: ['../../.eslintrc.js'],
  rules: {
    // Console is allowed for compliance logging
    'no-console': 'off',
    // Allow any types for dynamic compliance rules
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
    // Compliance gates are async for future database calls
    '@typescript-eslint/require-await': 'off',
  },
};
