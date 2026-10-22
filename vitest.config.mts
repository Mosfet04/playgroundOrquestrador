import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

import { TEST_ENV } from './e2e/test-env'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // src/server/** importa 'server-only', que o Next resolve no build (o
      // pacote não é dependência direta). Nos testes vale a versão do servidor.
      'server-only': fileURLToPath(
        new URL('./node_modules/next/dist/compiled/server-only/empty.js', import.meta.url)
      )
    }
  },
  // tsconfig usa `jsx: preserve` (o Next compila o JSX); nos testes o Vite (Oxc)
  // precisa transformar o JSX com o runtime automático do React.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    restoreMocks: true,
    env: TEST_ENV
  }
})
