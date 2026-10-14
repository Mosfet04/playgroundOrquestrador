import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'

import { server } from './msw/server'

// O código de produção engole erros de rede (devolve [] ou 503), então só o
// 'error' do MSW não reprova o teste: guardamos as requisições sem handler e
// falhamos no afterEach (e no afterAll, para o fetch sem await do último teste).
const unhandledRequests: string[] = []

function failOnUnhandledRequests() {
  const leaked = unhandledRequests.splice(0)
  if (leaked.length > 0) {
    throw new Error(
      `Requisição fora do MSW (sem handler): ${leaked.join(', ')}. ` +
        'Pode ter vindo de um teste anterior que disparou fetch sem await.'
    )
  }
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
  server.events.on('request:unhandled', ({ request }) => {
    unhandledRequests.push(`${request.method} ${request.url}`)
  })
})

afterEach(() => {
  cleanup()
  server.resetHandlers()
  failOnUnhandledRequests()
})

afterAll(() => {
  try {
    failOnUnhandledRequests()
  } finally {
    server.close()
  }
})
