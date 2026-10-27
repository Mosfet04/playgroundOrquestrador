import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { AgentEditor } from '@/components/management/agents/AgentEditor'

import { renderWithIntl } from '../helpers/intl'
import { server } from '../msw/server'

// QA P3-04 (D-P3-04-2): ids de teams hostis no 409 viram texto e link seguro.
const router = vi.hoisted(() => ({ push: (href: string) => href }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

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

const agent = {
  id: 'agente-alfa',
  nome: 'Agente Alfa',
  model: 'llama3.2',
  factoryIaModel: 'ollama',
  descricao: 'Responde perguntas',
  prompt: 'Você é o Alfa.',
  active: true,
  tools_ids: [],
  version: 4
}

function serve(deleteResponse: () => Response) {
  const calls: string[] = []
  server.use(
    http.get('*/api/tools', () =>
      HttpResponse.json({
        success: true,
        data: { data: [], total: 0, page: 1, limit: 100, totalPages: 1 }
      })
    ),
    http.get('*/api/agents/:id', () => HttpResponse.json({ success: true, data: agent })),
    http.delete('*/api/agents/:id', () => {
      calls.push('DELETE')
      return deleteResponse()
    })
  )
  return calls
}

const conflict = (body: object) => () => HttpResponse.json({ success: false, error: 'conflict', ...body }, { status: 409 })

describe('409 used_by com ids hostis', () => {
  it('HTML, javascript: e caminho no id são texto; o link fica em /teams/<id codificado>', async () => {
    const ids = ['<img src=x onerror=alert(1)>', 'javascript:alert(1)', '../admin', '<script>alert(1)</script>']
    serve(conflict({ used_by: { teams: ids } }))
    const user = userEvent.setup()
    renderWithIntl(<AgentEditor id={agent.id} />)
    await user.click(await screen.findByRole('button', { name: 'Excluir agente' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir' }))

    const dialog = await screen.findByRole('dialog', { name: 'Agente em uso por teams' })
    const links = within(dialog).getAllByRole('link')

    expect(links).toHaveLength(4)
    for (const [index, link] of links.entries()) {
      expect(link).toHaveTextContent(ids[index])
      expect(link.getAttribute('href')).toBe(`/teams/${encodeURIComponent(ids[index])}`)
      expect(link.getAttribute('href')).toMatch(/^\/teams\/[^/]+$/)
    }
    expect(dialog.querySelector('img, script')).toBeNull()
  })

  it('lista longa fica numa região rolável, com todos os links', async () => {
    const ids = Array.from({ length: 100 }, (_, i) => `time-${i}`)
    serve(conflict({ used_by: { teams: ids } }))
    const user = userEvent.setup()
    renderWithIntl(<AgentEditor id={agent.id} />)
    await user.click(await screen.findByRole('button', { name: 'Excluir agente' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir' }))

    const dialog = await screen.findByRole('dialog', { name: 'Agente em uso por teams' })

    expect(within(dialog).getAllByRole('link')).toHaveLength(100)
    expect(dialog).toHaveTextContent('é membro de 100 teams')
  })
})
