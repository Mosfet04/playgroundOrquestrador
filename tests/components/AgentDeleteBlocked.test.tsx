import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Toaster } from 'sonner'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { AgentEditor } from '@/components/management/agents/AgentEditor'

import { renderWithIntl } from '../helpers/intl'
import { server } from '../msw/server'

// P3-04 (D-P3-04-2, V-P3-04-17): excluir um agent que é membro de teams. O BFF
// responde 409 com os ids; o mesmo Dialog troca de conteúdo e lista os teams.
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

async function tryDelete() {
  const user = userEvent.setup()
  renderWithIntl(
    <>
      <AgentEditor id={agent.id} />
      <Toaster />
    </>
  )
  const trigger = await screen.findByRole('button', { name: 'Excluir agente' })
  await user.click(trigger)
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir' }))
  return { user, trigger }
}

describe('excluir agent membro de teams', () => {
  it('troca o Dialog: título, contagem, ids dos teams como links em nova aba e só "Fechar"', async () => {
    const push = vi.spyOn(router, 'push')
    serve(conflict({ used_by: { teams: ['suporte-vendas', 'time a/b'] } }))

    await tryDelete()

    const dialog = await screen.findByRole('dialog', { name: 'Agente em uso por teams' })
    expect(dialog).toHaveTextContent(
      'Agente Alfa é membro de 2 teams. Tire-o da lista de membros de cada um e tente de novo.'
    )
    const list = within(dialog).getByRole('list', { name: 'Teams que usam Agente Alfa' })
    const links = within(list).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/teams/suporte-vendas', '/teams/time%20a%2Fb'])
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    }
    expect(links[0]).toHaveAccessibleName('suporte-vendas (abre em nova aba)')
    expect(within(dialog).queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()
    // Sem toast de falha e sem sair da página.
    expect(screen.queryByText(/Não foi possível excluir/)).not.toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it('o foco vai ao "Fechar" do rodapé; fechar devolve o foco a "Excluir agente" e o form fica como estava', async () => {
    serve(conflict({ used_by: { teams: ['suporte-vendas'] } }))
    const { user, trigger } = await tryDelete()

    const dialog = await screen.findByRole('dialog', { name: 'Agente em uso por teams' })
    expect(dialog).toHaveTextContent('é membro de 1 team. Tire-o da lista de membros dele e tente de novo.')
    const close = within(dialog).getAllByRole('button', { name: 'Fechar' }).find((button) => button.textContent?.includes('Fechar') && !button.querySelector('svg'))
    await waitFor(() => expect(close).toHaveFocus())

    await user.click(close as HTMLElement)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.getByLabelText(/^Nome/)).toHaveValue('Agente Alfa')
  })

  it('a descrição fica numa região aria-live="polite"', async () => {
    serve(conflict({ used_by: { teams: ['suporte-vendas'] } }))
    await tryDelete()

    const dialog = await screen.findByRole('dialog', { name: 'Agente em uso por teams' })
    expect(dialog.querySelector('[aria-live="polite"]')).toHaveTextContent('é membro de 1 team')
  })

  it('reabrir depois de fechar volta à confirmação', async () => {
    serve(conflict({ used_by: { teams: ['suporte-vendas'] } }))
    const { user, trigger } = await tryDelete()
    await screen.findByRole('dialog', { name: 'Agente em uso por teams' })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(trigger)

    const dialog = screen.getByRole('dialog', { name: 'Excluir agente' })
    expect(within(dialog).getByRole('button', { name: 'Excluir' })).toBeInTheDocument()
  })

  it('409 sem ids (orquestrador antigo): texto genérico, sem lista', async () => {
    serve(conflict({}))
    await tryDelete()

    const dialog = await screen.findByRole('dialog', { name: 'Agente em uso por teams' })
    expect(dialog).toHaveTextContent('O orquestrador recusou: o agente é membro de um ou mais teams.')
    expect(within(dialog).queryByRole('list')).not.toBeInTheDocument()
  })

  it('outra falha (500) segue o toast de antes e fecha o Dialog', async () => {
    serve(() => HttpResponse.json({ success: false, error: 'server_error' }, { status: 502 }))
    await tryDelete()

    expect(await screen.findByText('Não foi possível excluir o agente (código 502)')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
