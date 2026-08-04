import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'cobertura'],
      include: ['src/domain/**'],
      // Логика предметной области должна быть покрыта:
      // именно в ней ошибка приводит к неверным данным, а не
      // к заметному сбою интерфейса.
      thresholds: { lines: 70, functions: 70 },
    },
  },
});
