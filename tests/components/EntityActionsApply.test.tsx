import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Toaster } from 'sonner'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { RuntimeRevision, RuntimeRevisionProvider } from '@/components/layout/RuntimeRevision'
import { AgentEditor } from '@/components/management/agents/AgentEditor'

import { renderWithIntl } from '../helpers/intl'
import { stubBrowserApis } from '../helpers/toolForm'
import { RUNTIME_URL } from '../msw/handlers'
import { server } from '../msw/server'
import { saveAndConfirm, touchName } from '../helpers/saveReview'

// P4-01 (spec docs/design/P4-01.md §5, V-P4-01-10 a 12): Excluir, Desativar e
// Reativar levam o resultado de aplicação no toast que já existe; com
// sucesso, a casca troca a revisão sem nova leitura. Não aplicada e não
// confirmada não mexem no badge nem no botão.

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
  version: 4
}

type Action = 'delete' | 'deactivate' | 'reactivate'
const ACTIONS = {
  delete: { button: 'Excluir agente', confirm: 'Excluir', done: 'Agente excluído', failed: 'Não foi possível excluir o agente', warned: 'Exclusão não confirmada', start: agent },
  deactivate: { button: 'Desativar agente', confirm: 'Desativar', done: 'Agente desativado', failed: 'Não foi possível desativar o agente', warned: 'Desativação não confirmada', start: agent },
  reactivate: { button: 'Reativar agente', confirm: undefined, done: 'Agente reativado', failed: 'Não foi possível reativar o agente', warned: 'Reativação não confirmada', start: { ...agent, active: false } }
} as const

function serve(action: Action, respond: () => Response) {
  const seen = { runtime: 0 }
  server.use(
    http.get(RUNTIME_URL, () => {
      seen.runtime++
      return HttpResponse.json({ success: true, data: { revision: 7 } })
    }),
    http.get('*/api/tools', () =>
      HttpResponse.json({ success: true, data: { data: [], total: 0, page: 1, limit: 100, totalPages: 1 } })
    ),
    http.get('*/api/agents/:id', () => HttpResponse.json({ success: true, data: ACTIONS[action].start })),
    http[action === 'reactivate' ? 'put' : 'delete']('*/api/agents/:id', respond)
  )
  return seen
}

async function runAction(action: Action) {
  const user = userEvent.setup()
  renderWithIntl(
    <RuntimeRevisionProvider>
      <RuntimeRevision />
      <AgentEditor id={agent.id} />
      <Toaster />
    </RuntimeRevisionProvider>
  )
  await screen.findByText('Revisão do runtime: 7')
  const { button, confirm } = ACTIONS[action]
  await user.click(await screen.findByRole('button', { name: button }))
  if (confirm) await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: confirm }))
}

const success = (action: Action, extra: object) => () =>
  HttpResponse.json({
    success: true,
    ...(action === 'delete' ? {} : { data: { ...ACTIONS[action].start, active: action === 'reactivate', version: 5 } }),
    ...extra
  })

describe.each(Object.keys(ACTIONS) as Action[])('%s', (action) => {
  const { done, failed, warned, button } = ACTIONS[action]

  it('sucesso com N: o toast de hoje com a revisão; a casca troca sem nova leitura', async () => {
    const seen = serve(action, success(action, { runtimeRevision: 9 }))
    await runAction(action)

    expect(await screen.findByText(done)).toBeInTheDocument()
    expect(screen.getByText('Mudança aplicada na revisão 9 do runtime.')).toBeInTheDocument()
    expect(screen.getByText('Revisão do runtime: 9')).toBeInTheDocument()
    expect(seen.runtime).toBe(1)
  })

  it('sucesso sem N: "Mudança aplicada no runtime." e a casca não muda', async () => {
    serve(action, success(action, {}))
    await runAction(action)

    expect(await screen.findByText('Mudança aplicada no runtime.')).toBeInTheDocument()
    expect(screen.getByText('Revisão do runtime: 7')).toBeInTheDocument()
  })

  it('não aplicada: título de hoje sem código, o texto próprio e o detalhe técnico; badge e botão ficam', async () => {
    serve(action, () =>
      HttpResponse.json({ success: false, error: 'not_applied', errorType: 'KeyError' }, { status: 422 })
    )
    await runAction(action)

    expect(await screen.findByText(failed)).toBeInTheDocument()
    expect(screen.queryByText(/código 422/)).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'O orquestrador não conseguiu carregar a configuração resultante. Nada mudou e a versão anterior segue no ar.'
      )
    ).toBeInTheDocument()
    expect(screen.getByText('KeyError').tagName).toBe('CODE')
    expect(screen.getByText('KeyError').parentElement).toHaveTextContent('Detalhe técnico: KeyError')
    await waitFor(() => expect(screen.getByRole('button', { name: button })).toHaveFocus())
    expect(screen.getByText('Revisão do runtime: 7')).toBeInTheDocument()
    expect(screen.getByText(action === 'reactivate' ? 'Inativo' : 'Ativo', { exact: true })).toBeInTheDocument()
  })

  it('não aplicada sem errorType: sem a linha do detalhe técnico', async () => {
    serve(action, () => HttpResponse.json({ success: false, error: 'not_applied' }, { status: 422 }))
    await runAction(action)

    expect(await screen.findByText(failed)).toBeInTheDocument()
    expect(screen.queryByText(/Detalhe técnico/)).not.toBeInTheDocument()
  })

  it('não confirmada: toast de aviso próprio; fica no editor', async () => {
    const push = vi.spyOn(router, 'push')
    serve(action, () => HttpResponse.json({ success: false, error: 'not_confirmed' }, { status: 502 }))
    await runAction(action)

    expect(await screen.findByText(warned)).toBeInTheDocument()
    expect(
      screen.getByText(
        'O orquestrador falhou depois de receber o pedido. A mudança pode ter sido gravada sem entrar no ar; recarregue a página para conferir.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText(failed)).not.toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 1, name: 'Editar agente' })).toBeInTheDocument()
  })
})

it('o início de uma ação tira o status do último Salvar', async () => {
  serve('deactivate', success('deactivate', {}))
  server.use(http.put('*/api/agents/:id', () => HttpResponse.json({ success: true, data: agent })))
  const user = userEvent.setup()
  renderWithIntl(
    <RuntimeRevisionProvider>
      <AgentEditor id={agent.id} />
      <Toaster />
    </RuntimeRevisionProvider>
  )
  await touchName(user)
  await saveAndConfirm(user)
  expect(await screen.findByText('Agente salvo.')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Desativar agente' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Desativar' }))

  expect(await screen.findByText('Agente desativado')).toBeInTheDocument()
  expect(screen.queryByText('Agente salvo.')).not.toBeInTheDocument()
})
