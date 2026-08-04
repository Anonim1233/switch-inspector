import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        window: 'readonly', document: 'readonly', localStorage: 'readonly',
        fetch: 'readonly', URL: 'readonly', URLSearchParams: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly',
        console: 'readonly', alert: 'readonly', confirm: 'readonly',
        EventSource: 'readonly', FileReader: 'readonly', Blob: 'readonly',
        navigator: 'readonly', history: 'readonly',
      },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: '18.3' } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // Новый способ записи разметки не требует ввоза библиотеки в каждый файл
      'react/react-in-jsx-scope': 'off',
      // Проверка типов свойств не используется — при необходимости
      // заменяется на статическую типизацию целиком
      'react/prop-types': 'off',

      // Неиспользуемые значения — частый след незавершённой правки.
      // Имена с подчёркиванием в начале разрешены: так помечают
      // намеренно пропущенные аргументы.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

      // Пустой перехват ошибки допустим, если объяснён комментарием
      'no-empty': ['error', { allowEmptyCatch: true }],

      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  { ignores: ['dist/', 'node_modules/', 'check-*.cjs'] },
];
