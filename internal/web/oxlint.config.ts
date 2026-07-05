import { defineConfig } from 'oxlint';
import '@tanstack/eslint-plugin-query';
import '@tanstack/eslint-plugin-router';

export default defineConfig({
  plugins: ['react', 'unicorn', 'typescript', 'node'],
  jsPlugins: [
    '@tanstack/eslint-plugin-query',
    '@tanstack/eslint-plugin-router',
    'eslint-plugin-simple-import-sort',
    'eslint-plugin-storybook',
  ],
  categories: {
    correctness: 'error',
  },
  rules: {
    'no-unreachable': 'error',
    'typescript/no-unused-vars': [
      'error',
      {
        args: 'all',
        argsIgnorePattern: '^_',
        caughtErrors: 'all',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      },
    ],
    'unicorn/filename-case': ['error', { case: 'kebabCase' }],
    'simple-import-sort/imports': [
      'warn',
      {
        groups: [
          ['^@?\\w', '^\\u0000'],
          ['^.+\\.s?css$'],
          ['^@/lib', '^@/hooks'],
          ['^@/data'],
          ['^@/components', '^@/container'],
          ['^@/store'],
          ['^@/'],
          [
            '^\\./?$',
            '^\\.(?!/?$)',
            '^\\.\\./?$',
            '^\\.\\.(?!/?$)',
            '^\\.\\./\\.\\./?$',
            '^\\.\\./\\.\\.(?!/?$)',
            '^\\.\\./\\.\\./\\.\\./?$',
            '^\\.\\./\\.\\./\\.\\.\\.(?!/?$)',
          ],
          ['^@/types'],
          ['^'],
        ],
      },
    ],
    'simple-import-sort/exports': 'warn',
    '@tanstack/query/exhaustive-deps': 'error',
    '@tanstack/query/no-rest-destructuring': 'warn',
    '@tanstack/query/stable-query-client': 'error',
    '@tanstack/query/no-unstable-deps': 'error',
    '@tanstack/query/infinite-query-property-order': 'error',
    '@tanstack/query/no-void-query-fn': 'error',
    '@tanstack/query/mutation-property-order': 'error',
    '@tanstack/router/create-route-property-order': 'warn',
    '@tanstack/router/route-param-names': 'error',
  },
  overrides: [
    {
      files: ['src/**/*'],
      rules: {
        'node/no-process-env': 'error',
      },
    },
    {
      files: [
        'src/routes/**/*.*',
        '**/generated/**/*.*',
        'src/route-tree.gen.ts',
      ],
      rules: {
        'unicorn/filename-case': 'off',
      },
    },
    {
      files: ['**/*.stories.*'],
      rules: {
        'storybook/await-interactions': 'error',
        'storybook/context-in-play-function': 'error',
        'storybook/default-exports': 'error',
        'storybook/hierarchy-separator': 'warn',
        'storybook/no-redundant-story-name': 'warn',
        'storybook/no-renderer-packages': 'error',
        'storybook/prefer-pascal-case': 'warn',
        'storybook/story-exports': 'error',
        'storybook/use-storybook-expect': 'error',
        'storybook/use-storybook-testing-library': 'error',
        'storybook/no-uninstalled-addons': 'error',
      },
    },
  ],
});
