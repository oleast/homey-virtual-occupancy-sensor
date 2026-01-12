import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.ts', '**/*.spec.ts'],
    exclude: ['node_modules', '.homeybuild', '.git'],
    globals: true, // Optional: allows describing/it without import, usually convenient
    environment: 'node',
  },
});
