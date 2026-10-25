import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { agentBodySchema } from '@/app/api/agents/schema'
import { AgentForm } from '@/components/management/agents/AgentForm'

import { server } from '../msw/server'
import { renderWithIntl } from '../helpers/intl'

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})

describe('AgentForm: envio', () => {
  it('manda ao BFF um corpo que o schema aceita, com a tool marcada na 2ª página', async () => {
    const bodies: unknown[] = []
    server.use(
      http.get('*/api/tools', ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page') ?? '1')
        return HttpResponse.json({
          success: true,
          data: {
            data: [{ id: `tool-p${page}`, name: `Tool da página ${page}`, description: 'd' }],
            total: 2,
            page,
            limit: 100,
            totalPages: 2
          }
        })
      }),
      http.post('*/api/agents', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ success: true, message: 'ok' })
      })
    )
    const user = userEvent.setup()
    renderWithIntl(<AgentForm onSuccess={() => {}} />)

    await user.type(screen.getByLabelText(/ID do agente/), 'assistente')
    await user.type(screen.getByLabelText(/^Nome/), 'Assistente')
    await user.type(screen.getByLabelText(/^Modelo \*/), 'llama3.2')
    await user.click(await screen.findByRole('checkbox', { name: /Tool da página 2/ }))
    await user.click(screen.getByRole('button', { name: /salvar|criar/i }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toMatchObject({
      id: 'assistente',
      factoryIaModel: 'ollama',
      tools_ids: ['tool-p2']
    })
    expect(agentBodySchema.safeParse(bodies[0]).success).toBe(true)
  })
})
