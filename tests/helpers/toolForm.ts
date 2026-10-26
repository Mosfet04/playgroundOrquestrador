import { screen } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { vi } from 'vitest'

import type { Tool } from '@/types/management'

import { server } from '../msw/server'

// Apoio dos testes do ToolForm (P3-03): o jsdom não implementa as APIs que
// Switch e Select do Radix usam.
export function stubBrowserApis() {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.releasePointerCapture = () => undefined
  Element.prototype.scrollIntoView = () => undefined
}

export const tool: Tool = {
  id: 'pedidos',
  name: 'Pedidos',
  description: 'Consulta pedidos',
  route: 'https://api.loja.example/v1/orders/{order_id}',
  http_method: 'GET',
  parameters: [{ name: 'order_id', type: 'string', description: 'Código', required: true }],
  instructions: '',
  headers: {},
  active: true,
  version: 4
}

// Corpos recebidos pelo BFF no salvar (POST de tool nova, PUT de existente).
export function captureSave(method: 'post' | 'put' = 'put') {
  const bodies: Record<string, unknown>[] = []
  server.use(
    http[method](method === 'put' ? '*/api/tools/:id' : '*/api/tools', async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json({ success: true, data: {} })
    })
  )
  return bodies
}

// `user.type` lê `{` como tecla especial: a rota entra por colagem.
export async function paste(user: UserEvent, field: HTMLElement, text: string) {
  await user.clear(field)
  await user.click(field)
  await user.paste(text)
}

export const saveButton = () => screen.getByRole('button', { name: 'Salvar' })
