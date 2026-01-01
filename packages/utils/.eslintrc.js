module.exports = {
  extends: ['../../.eslintrc.js'],
  rules: {
    // Console is allowed in utility packages
    'no-console': 'off',
    // Allow unsafe patterns in utility code
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/restrict-plus-operands': 'off',
    '@typescript-eslint/no-base-to-string': 'off',
    '@typescript-eslint/only-throw-error': 'off',
  },
};
