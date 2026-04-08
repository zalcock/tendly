import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/__tests__/**/*.test.ts', 'app/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
  },
})
