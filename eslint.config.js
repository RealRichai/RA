// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

/**
 * RealRiches ESLint Configuration
 * 
 * Enforces:
 * - TypeScript strict mode
 * - Naming conventions (camelCase, PascalCase)
 * - Security best practices
 * - Code quality standards
 */
export default tseslint.config(
  // Base configurations
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  eslintPluginPrettierRecommended,
  
  // Global ignores
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/*.config.js',
      '**/*.config.ts',
      '**/next.config.js',
    ],
  },
  
  // TypeScript files configuration
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // =================================================================
      // NAMING CONVENTIONS
      // =================================================================
      '@typescript-eslint/naming-convention': [
        'error',
        // Variables and functions: camelCase
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
          leadingUnderscore: 'allow',
        },
        {
          selector: 'function',
          format: ['camelCase', 'PascalCase'],
        },
        // Parameters: camelCase
        {
          selector: 'parameter',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
        // Classes, interfaces, types, enums: PascalCase
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        // Enum members: UPPER_CASE or PascalCase
        {
          selector: 'enumMember',
          format: ['UPPER_CASE', 'PascalCase'],
        },
        // Object properties: camelCase or UPPER_CASE (for constants)
        {
          selector: 'property',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
          leadingUnderscore: 'allow',
        },
        // Type properties: camelCase
        {
          selector: 'typeProperty',
          format: ['camelCase'],
        },
      ],
      
      // =================================================================
      // TYPE SAFETY
      // =================================================================
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      
      // Prohibit empty interfaces
      '@typescript-eslint/no-empty-interface': 'error',
      '@typescript-eslint/no-empty-object-type': 'error',
      
      // Require explicit return types on exported functions
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],
      
      // Require explicit accessibility modifiers
      '@typescript-eslint/explicit-member-accessibility': [
        'error',
        { accessibility: 'explicit' },
      ],
      
      // =================================================================
      // SECURITY
      // =================================================================
      // Prevent eval and similar dangerous functions
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      
      // Prevent prototype pollution
      'no-proto': 'error',
      'no-extend-native': 'error',
      
      // Prevent console.log in production
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      
      // =================================================================
      // CODE QUALITY
      // =================================================================
      // Require === and !==
      'eqeqeq': ['error', 'always'],
      
      // Prevent unused expressions
      '@typescript-eslint/no-unused-expressions': 'error',
      
      // Require const for variables that are never reassigned
      'prefer-const': 'error',
      
      // Prevent var
      'no-var': 'error',
      
      // Require object shorthand
      'object-shorthand': ['error', 'always'],
      
      // Prevent nested callbacks beyond 3 levels
      'max-nested-callbacks': ['error', 3],
      
      // Limit cyclomatic complexity
      'complexity': ['warn', 15],
      
      // Limit function length
      'max-lines-per-function': ['warn', { max: 100, skipBlankLines: true, skipComments: true }],
      
      // =================================================================
      // DOCUMENTATION
      // =================================================================
      // This would require eslint-plugin-jsdoc
      // '@typescript-eslint/require-jsdoc': 'warn',
    },
  },
  
  // React/Next.js specific rules
  {
    files: ['**/apps/web/**/*.tsx'],
    rules: {
      // Allow PascalCase for React components
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
        },
        {
          selector: 'function',
          format: ['camelCase', 'PascalCase'],
        },
      ],
      // Relax explicit return types for React components
      '@typescript-eslint/explicit-function-return-type': 'off',
      // Relax member accessibility for React components
      '@typescript-eslint/explicit-member-accessibility': 'off',
    },
  },
  
  // Test files
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
    rules: {
      // Allow any in tests
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      // Allow console in tests
      'no-console': 'off',
      // Relax function length in tests
      'max-lines-per-function': 'off',
    },
  },
);
