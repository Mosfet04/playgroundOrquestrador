import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { delay, http, HttpResponse } from 'msw'
import { Toaster } from 'sonner'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { RuntimeRevision, RuntimeRevisionProvider } from '@/components/layout/RuntimeRevision'
import { AgentEditor } from '@/components/management/agents/AgentEditor'

import { renderWithIntl } from '../helpers/intl'
import { stubBrowserApis } from '../helpers/toolForm'
import { RUNTIME_URL } from '../msw/handlers'
import { server } from '../msw/server'
import { saveAndConfirm, touchName } from '../helpers/saveReview'

// QA P4-01: corridas e fronteiras que os testes do dev não alcançam. Dois
// Salvar seguidos, editor desmontado no meio do PUT e a revisão 0 (inteiro
// ≥ 0, falsy em JS) no status e na casca.

const router = vi.hoisted(() => ({ push: (href: string) => href }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

beforeAll(stubBrowserApis)

const agent = {
  id: 'assistente',
  nome: 'Assistente',
  model: 'gpt-4o',
  factoryIaModel: 'openai',
  descricao: '',
  prompt: 'Seja útil.',
  active: true,
  tools_ids: [],
  version: 3
}
const emptyPage = { success: true, data: { data: [], total: 0, page: 1, limit: 100, totalPages: 1 } }

// PUTs vistos (If-Match de cada um); a resposta vem de `respond`.
function serve(respond: (n: number) => Response | Promise<Response>) {
  const puts: (string | null)[] = []
  server.use(
    http.get(RUNTIME_URL, () => HttpResponse.json({ success: true, data: { revision: 7 } })),
    http.get('*/api/tools', () => HttpResponse.json(emptyPage)),
    http.get('*/api/agents/:id', () => HttpResponse.json({ success: true, data: agent })),
    http.put('*/api/agents/:id', ({ request }) => {
      puts.push(request.headers.get('if-match'))
      return respond(puts.length)
    })
  )
  return puts
}

const region = () => document.querySelector<HTMLElement>('[aria-live="polite"][aria-atomic="true"]')!

// Editor dentro da casca, com um botão fora do editor que o desmonta (como
// sair da rota: o provider da casca fica).
let unmountEditor = () => {}
function Shell() {
  const [shown, setShown] = useState(true)
  unmountEditor = () => setShown(false)
  return (
    <RuntimeRevisionProvider>
      <RuntimeRevision />
      {shown && <AgentEditor id={agent.id} />}
      <Toaster />
    </RuntimeRevisionProvider>
  )
}

async function renderEditor() {
  const user = userEvent.setup()
  renderWithIntl(<Shell />)
  await screen.findByText('Revisão do runtime: 7')
  const save = await screen.findByRole('button', { name: 'Salvar' })
  await waitFor(() => expect(save).toBeEnabled())
  return { user, save }
}

describe('QA P4-01: status de aplicação', () => {
  it('duplo clique no Confirmar envia um PUT só (sem 412 contra a própria escrita)', async () => {
    // O PUT demora como na rede: o 2º clique chega com o 1º em voo.
    const puts = serve(async () => {
      await delay(100)
      return HttpResponse.json({ success: true, data: { ...agent, version: 4 }, runtimeRevision: 8 })
    })
    const { user, save } = await renderEditor()

    await touchName(user)
    await user.click(save)
    await user.dblClick(await screen.findByRole('button', { name: 'Confirmar e salvar' }))

    await waitFor(() => expect(region()).toHaveTextContent('revisão 8'))
    expect(puts).toEqual(['"3"'])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('editor desmontado no meio do PUT: a casca ainda recebe a revisão da escrita aceita, sem erro', async () => {
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    serve(async () => {
      await held
      return HttpResponse.json({ success: true, data: { ...agent, version: 4 }, runtimeRevision: 9 })
    })
    const errors = vi.spyOn(console, 'error')
    const { user } = await renderEditor()

    await touchName(user)
    await saveAndConfirm(user)
    await screen.findByRole('button', { name: 'Salvando…' })
    act(() => unmountEditor())
    expect(screen.queryByRole('button', { name: /Salvar|Salvando/ })).not.toBeInTheDocument()

    await act(async () => {
      release()
      await held
    })

    expect(await screen.findByText('Revisão do runtime: 9')).toBeInTheDocument()
    expect(errors).not.toHaveBeenCalled()
  })

  it('revisão 0 (fronteira, falsy) aparece no status e na casca', async () => {
    serve(() => HttpResponse.json({ success: true, data: { ...agent, version: 4 }, runtimeRevision: 0 }))
    const { user } = await renderEditor()

    await touchName(user)
    await saveAndConfirm(user)

    await waitFor(() =>
      expect(region()).toHaveTextContent('Agente salvo. Mudança aplicada na revisão 0 do runtime.')
    )
    expect(within(region()).getByText('0')).toHaveClass('font-mono')
    expect(screen.getByText('Revisão do runtime: 0')).toBeInTheDocument()
  })
})
