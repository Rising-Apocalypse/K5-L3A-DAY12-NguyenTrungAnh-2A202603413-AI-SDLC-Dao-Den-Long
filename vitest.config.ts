import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts (whose root is src/web): tests live in ./tests and run from the repo root.
export default defineConfig({
  test: {
    root: '.',
    include: ['tests/**/*.test.ts'],
  },
});
