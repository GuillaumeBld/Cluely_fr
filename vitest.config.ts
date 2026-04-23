import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    root: path.resolve(__dirname),
    include: ['test/**/*.test.ts'],
    alias: {
      electron: path.resolve(__dirname, 'test/__mocks__/electron.ts'),
    },
  },
});
