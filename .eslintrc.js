module.exports = {
  extends: ['../../packages/eslint-config/base.js'],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  env: {
    browser: true,
    webextensions: true,
    es2020: true,
    node: true,
    jest: true,
  },
  rules: {
    // Extension-specific rules
    'no-console': 'off', // Allow console in extensions for debugging
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  ignorePatterns: ['dist-dev', 'dist-prod', 'node_modules'],
};
