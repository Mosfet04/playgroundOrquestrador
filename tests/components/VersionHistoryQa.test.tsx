import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Toaster } from 'sonner'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { RuntimeRevision, RuntimeRevisionProvider } from '@/components/layout/RuntimeRevision'
import { AgentEditor } from '@/components/management/agents/AgentEditor'

import { renderWithIntl } from '../helpers/intl'
import { stubBrowserApis } from '../helpers/toolForm'
import { RUNTIME_URL, runtimeBody } from '../msw/handlers'
import { server } from '../msw/server'

// QA do P4-04: o que o VersionHistory.test.tsx do dev não alcança. Restaurar
// em clique duplo, Esc e foco preso (spec §5) e texto hostil (ator, prompt,
// nome) que a tela só pode mostrar como texto.

const router = vi.hoisted(() => ({ push: (href: string) => href }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

beforeAll(stubBrowserApis)

const AT = '2026-11-14T17:32:00+00:00'
const agent = {
  id: 'pedidos',
  nome: 'Pedidos',
  model: 'gpt-4o',
  factoryIaModel: 'openai',
  descricao: '',
  prompt: 'Seja útil.',
  active: true,
  tools_ids: [],
  model_params: { temperature: 0.2 },
  version: 8
}
const at = (version: number, patch: object = {}) => ({ ...agent, ...patch, version })
const entry = (version: number, document: object | null, previous: object | null, extra: object = {}) => ({
  version,
  actor: 'admin',
  at: AT,
  document,
  previous,
  ...extra
})

const HOSTILE_PROMPT = '<script>window.__pwned = 1</script> [clique](javascript:window.__pwned=2) <img src=x onerror="window.__pwned=3">'
const HOSTILE_ACTOR = '<img src=x onerror="window.__pwned=4">'
const HISTORY = [
  entry(8, agent, at(8, { model_params: { temperature: 0.7 } })),
  entry(5, at(5, { prompt: HOSTILE_PROMPT, nome: '<b>Negrito</b>' }), at(5), { actor: HOSTILE_ACTOR })
]

function serve(restore: () => Response | Promise<Response> = () => HttpResponse.json({ success: true, data: at(9), runtimeRevision: 12 })) {
  const restores: string[] = []
  server.use(
    http.get(RUNTIME_URL, () => HttpResponse.json(runtimeBody(7))),
    http.get('*/api/tools', () =>
      HttpResponse.json({ success: true, data: { data: [], total: 0, page: 1, limit: 100, totalPages: 1 } })
    ),
    http.get('*/api/agents/:id', () => HttpResponse.json({ success: true, data: agent })),
    http.get('*/api/agents/:id/history', () =>
      HttpResponse.json({ success: true, data: { items: HISTORY, total: 2, offset: 0, limit: 20 } })
    ),
    http.post('*/api/agents/:id/history/:version/restore', () => {
      restores.push('POST')
      return restore()
    })
  )
  return restores
}

async function renderAgent() {
  const user = userEvent.setup()
  renderWithIntl(
    <RuntimeRevisionProvider>
      <RuntimeRevision />
      <AgentEditor id={agent.id} />
      <Toaster />
    </RuntimeRevisionProvider>
  )
  await screen.findByRole('heading', { level: 1 })
  return user
}

const sheet = () => screen.getByRole('dialog', { name: 'Histórico de versões' })
const rowOf = (version: number) =>
  within(within(sheet()).getByRole('list', { name: 'Versões' }))
    .getAllByRole('listitem')
    .find((item) => item.textContent?.startsWith(`v${version}`))!

async function openHistory(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Histórico' }))
  await screen.findByRole('list', { name: 'Versões' })
}

async function openRestore(user: ReturnType<typeof userEvent.setup>) {
  await openHistory(user)
  await user.click(within(rowOf(5)).getByRole('button', { name: 'Restaurar a v5' }))
  return screen.findByRole('alertdialog', { name: 'Restaurar a v5?' })
}

describe('QA P4-04: restaurar uma vez só', () => {
  it('clique duplo (userEvent e dois eventos síncronos) em "Restaurar a v5" faz um POST', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const restores = serve(async () => {
      await gate
      return HttpResponse.json({ success: true, data: at(9), runtimeRevision: 12 })
    })
    const user = await renderAgent()
    const dialog = await openRestore(user)
    const confirm = within(dialog).getByRole('button', { name: 'Restaurar a v5' })

    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await user.dblClick(confirm)
    await user.keyboard('{Enter}')
    release()

    expect(await screen.findByText('v5 restaurada como v9.')).toBeVisible()
    expect(restores).toEqual(['POST'])
  })
})

describe('QA P4-04: teclado e foco (spec §5)', () => {
  it('Esc no diálogo de confirmação em repouso fecha só o diálogo, nada é gravado e o foco volta ao Restaurar da linha', async () => {
    const restores = serve()
    const user = await renderAgent()
    await openRestore(user)

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(sheet()).toBeVisible()
    await waitFor(() => expect(within(rowOf(5)).getByRole('button', { name: 'Restaurar a v5' })).toHaveFocus())
    expect(restores).toEqual([])
  })

  it('Esc no Sheet fecha e o foco volta ao botão Histórico; Tab com o Sheet aberto não sai dele', async () => {
    serve()
    const user = await renderAgent()
    const trigger = screen.getByRole('button', { name: 'Histórico' })
    await openHistory(user)

    for (let press = 0; press < 12; press++) {
      await user.tab()
      expect(sheet().contains(document.activeElement), `Tab ${press + 1}`).toBe(true)
    }
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Histórico de versões' })).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
    expect(trigger).not.toHaveAttribute('aria-expanded', 'true')
  })

  it('Tab com o diálogo de confirmação aberto não sai dele (Cancelar, X, Restaurar)', async () => {
    serve()
    const user = await renderAgent()
    const dialog = await openRestore(user)

    for (let press = 0; press < 8; press++) {
      await user.tab()
      expect(dialog.contains(document.activeElement), `Tab ${press + 1}`).toBe(true)
    }
  })
})

describe('QA P4-04: texto hostil só aparece como texto', () => {
  it('ator, prompt e nome com HTML e javascript: no Sheet e no diálogo: nenhum elemento ou link novo', async () => {
    serve()
    const user = await renderAgent()
    await openHistory(user)
    // Com a confirmação aberta o Sheet fica aria-hidden: guardado antes.
    const history = sheet()

    await user.click(within(rowOf(5)).getByRole('button', { name: 'Ver alterações' }))
    expect(within(rowOf(5)).getByText(HOSTILE_ACTOR)).toBeVisible()
    expect(within(rowOf(5)).getByText('<b>Negrito</b>')).toBeVisible()
    await user.click(within(rowOf(5)).getByRole('button', { name: 'Restaurar a v5' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Restaurar a v5?' })
    await within(dialog).findByRole('region', { name: 'Campos que mudam' })

    // O nome hostil também está na lista de campos do diálogo: texto, não elemento.
    expect(within(dialog).getByText('<b>Negrito</b>')).toBeVisible()
    for (const root of [history, dialog]) {
      expect(root.querySelector('script, img, iframe, object, embed')).toBeNull()
      expect([...root.querySelectorAll('b')].filter((bold) => bold.textContent === 'Negrito')).toEqual([])
      expect(root.querySelector('a[href^="javascript:" i]')).toBeNull()
      expect(root.querySelector('[onerror], [onclick]')).toBeNull()
    }
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
  })
})

describe('QA P4-04: segredo legado no histórico', () => {
  it('api_key_ref que não é referência (legado) nunca aparece em claro no Sheet nem no diálogo de restaurar', async () => {
    const RAW = 'LEAK-QA-LEGADO-EM-CLARO'
    const RAW_BEFORE = 'LEAK-QA-LEGADO-ANTES'
    server.use(
      http.get(RUNTIME_URL, () => HttpResponse.json(runtimeBody(7))),
      http.get('*/api/tools', () =>
        HttpResponse.json({ success: true, data: { data: [], total: 0, page: 1, limit: 100, totalPages: 1 } })
      ),
      http.get('*/api/agents/:id', () => HttpResponse.json({ success: true, data: agent })),
      http.get('*/api/agents/:id/history', () =>
        HttpResponse.json({
          success: true,
          data: {
            items: [
              entry(8, agent, at(8, { api_key_ref: 'env:OPENAI_API_KEY' })),
              entry(5, at(5, { api_key_ref: RAW }), at(5, { api_key_ref: RAW_BEFORE }))
            ],
            total: 2,
            offset: 0,
            limit: 20
          }
        })
      )
    )
    const user = await renderAgent()
    await openHistory(user)
    const history = sheet()

    await user.click(within(rowOf(5)).getByRole('button', { name: 'Ver alterações' }))
    await user.click(within(rowOf(5)).getByRole('button', { name: 'Restaurar a v5' }))
    await screen.findByRole('alertdialog', { name: 'Restaurar a v5?' })

    expect(document.body.innerHTML).not.toContain(RAW)
    expect(document.body.innerHTML).not.toContain(RAW_BEFORE)
    expect(history.textContent).toContain('texto oculto')
  })
})
