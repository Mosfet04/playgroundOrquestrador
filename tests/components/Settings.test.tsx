import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { RuntimeRevision, RuntimeRevisionProvider } from '@/components/layout/RuntimeRevision'
import { Settings } from '@/components/management/settings/Settings'

import { renderWithIntl } from '../helpers/intl'
import { RUNTIME_URL, SCHEMA_URL, runtimeBody, runtimeHealth, schemaFixture } from '../msw/handlers'
import { server } from '../msw/server'

// P4-05: /settings com a saúde do orquestrador (a leitura da casca, sem
// request próprio), o config store e os provedores (/api/config/schema), cada
// leitura com carregando e erro próprios; "Atualizar" relê só a saúde; e o
// "Recarregar runtime" com confirmação e os desfechos da D-P4-05-6/10.

const RELOAD_URL = '*/api/config/reload'

function serve({
  health = () => HttpResponse.json(runtimeBody(7)),
  schema = () => HttpResponse.json({ success: true, data: schemaFixture })
}: {
  health?: () => Response | Promise<Response>
  schema?: () => Response | Promise<Response>
} = {}) {
  const calls = { health: 0, schema: 0, reload: 0 }
  server.use(
    http.get(RUNTIME_URL, () => {
      calls.health++
      return health()
    }),
    http.get(SCHEMA_URL, () => {
      calls.schema++
      return schema()
    })
  )
  return calls
}

const serveReload = (respond: () => Response | Promise<Response>) => {
  const calls = { count: 0 }
  server.use(
    http.post(RELOAD_URL, () => {
      calls.count++
      return respond()
    })
  )
  return calls
}

const renderSettings = (locale: 'pt-BR' | 'en' = 'pt-BR') =>
  renderWithIntl(
    <RuntimeRevisionProvider>
      <RuntimeRevision />
      <Settings />
    </RuntimeRevisionProvider>,
    { locale }
  )

const section = (name: string) => screen.getByRole('region', { name })
const findSection = (name: string) => screen.findByRole('region', { name })
const indicator = () => screen.getByRole('link')
// Badge geral: no cabeçalho da seção, ao lado do título.
const header = (region: HTMLElement) => region.querySelector('header') as HTMLElement
// Valor de um item da lista de fatos (Revisão do runtime, Tempo de resposta…).
const fact = (region: HTMLElement, label: string) =>
  within(region).getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement
const liveRegion = () => document.querySelector('[aria-live="polite"][aria-atomic="true"]') as HTMLElement
const failure = (status: number, error: string) => () =>
  HttpResponse.json({ success: false, error }, { status })

describe('Settings: leitura', () => {
  it('carregando: esqueletos por seção (aria-busy), casca e título no lugar', async () => {
    serve({
      health: async () => {
        await delay(50)
        return HttpResponse.json(runtimeBody(7))
      },
      schema: async () => {
        await delay(50)
        return HttpResponse.json({ success: true, data: schemaFixture })
      }
    })
    renderSettings()

    expect(screen.getByRole('heading', { level: 1, name: 'Configurações' })).toBeInTheDocument()
    for (const name of ['Orquestrador', 'Config store', 'Provedores de chat', 'Provedores de embedder'])
      expect(section(name)).toHaveAttribute('aria-busy', 'true')
    expect(liveRegion()).toBeEmptyDOMElement()

    await waitFor(() => expect(section('Orquestrador')).not.toHaveAttribute('aria-busy'))
  })

  it('saudável e gravável: badge, revisão, tempo, hora da leitura, checks, store e provedores; uma leitura de saúde', async () => {
    const calls = serve()
    renderSettings()

    const orchestrator = await findSection('Orquestrador')
    await within(header(orchestrator)).findByText('Saudável')
    const facts = fact(orchestrator, 'Revisão do runtime')
    expect(facts).toHaveTextContent('7')
    expect(fact(orchestrator, 'Tempo de resposta')).toHaveTextContent(
      '38,5 ms'
    )
    expect(fact(orchestrator, 'Lido em').textContent).toMatch(
      /^\d{2}:\d{2}:\d{2}$/
    )
    const checks = within(within(orchestrator).getByRole('list', { name: 'Checks de saúde' })).getAllByRole(
      'listitem'
    )
    expect(checks.map((item) => item.textContent)).toEqual([
      'Banco de dados (MongoDB)Saudável',
      'MemóriaSaudávelUso 42,3% · 9,1 GB livres',
      'Telemetria (OTLP)Configurada'
    ])
    expect(within(orchestrator).queryByRole('status')).not.toBeInTheDocument()

    const store = await findSection('Config store')
    expect(within(store).getByText('Gravável')).toBeInTheDocument()
    expect(store).toHaveTextContent('Agentes, teams e tools são salvos pela API Admin e aplicados a quente.')

    const chat = section('Provedores de chat')
    expect(within(chat).getByText('4')).toBeInTheDocument()
    const rows = within(chat).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(4)
    expect(within(rows[0]).getByText('ollama')).toHaveClass('font-mono')
    expect(within(rows[0]).getAllByText(/^(temperature|top_p|stop)$/)).toHaveLength(3)
    expect(within(rows[0]).getByText('Padrão do provedor')).toBeInTheDocument()
    expect(within(rows[3]).getByText('Exige base URL')).toBeInTheDocument()
    expect(within(section('Provedores de embedder')).getAllByRole('row')).toHaveLength(4)

    expect(indicator()).toHaveAccessibleName('Orquestrador online, revisão 7')
    expect(calls).toEqual({ health: 1, schema: 1, reload: 0 })
  })

  it('degradado e só leitura: faixa de atenção, check com falha em Erro, OTLP não configurada neutra, cadeado', async () => {
    serve({
      health: () =>
        HttpResponse.json({
          success: true,
          data: {
            ...runtimeHealth(28, 'degraded'),
            checks: {
              database: 'error',
              memory: { status: 'warning', usagePercent: 93 },
              telemetry: 'not_configured'
            }
          }
        }),
      schema: () => HttpResponse.json({ success: true, data: { ...schemaFixture, writable: false } })
    })
    renderSettings()

    const orchestrator = await findSection('Orquestrador')
    expect(await within(header(orchestrator)).findByText('Degradado')).toHaveClass(
      'text-warning'
    )
    expect(within(orchestrator).getByRole('status')).toHaveTextContent(
      'Algum check falhou. O orquestrador responde, mas parte dele pode não funcionar.'
    )
    const [database, memory, telemetry] = within(
      within(orchestrator).getByRole('list', { name: 'Checks de saúde' })
    ).getAllByRole('listitem')
    expect(within(database).getByText('Erro')).toHaveClass('text-destructive')
    expect(database).toHaveTextContent('Não respondeu.')
    expect(within(memory).getByText('Atenção')).toHaveClass('text-warning')
    expect(memory).toHaveTextContent('Uso 93%')
    expect(memory).not.toHaveTextContent('GB')
    expect(within(telemetry).getByText('Não configurada')).toHaveClass('text-muted-foreground')
    expect(telemetry).toHaveTextContent('Opcional. Nenhum provedor de telemetria definido.')
    expect(indicator()).toHaveAccessibleName('Orquestrador degradado, revisão 28')

    const store = await findSection('Config store')
    expect(within(store).getByText('Somente leitura')).toHaveClass('text-warning')
    expect(store).toHaveTextContent(
      'A configuração vem de arquivo YAML. Salvar e restaurar pela interface não estão disponíveis. Depois de editar o arquivo, use Recarregar runtime para aplicar.'
    )
    expect(within(orchestrator).getByRole('button', { name: 'Recarregar runtime' })).toBeEnabled()
  })

  it('memória indisponível e check que estourou: Indisponível (neutro) e Erro', async () => {
    serve({
      health: () =>
        HttpResponse.json({
          success: true,
          data: {
            ...runtimeHealth(2, 'degraded'),
            responseTimeMs: undefined,
            checks: { database: 'healthy', memory: { status: 'unavailable' }, telemetry: 'error' }
          }
        })
    })
    renderSettings()

    const orchestrator = await findSection('Orquestrador')
    const [, memory, telemetry] = within(
      await within(orchestrator).findByRole('list', { name: 'Checks de saúde' })
    ).getAllByRole('listitem')
    expect(within(memory).getByText('Indisponível')).toHaveClass('text-muted-foreground')
    expect(within(telemetry).getByText('Erro')).toHaveClass('text-destructive')
    expect(fact(orchestrator, 'Tempo de resposta')).toHaveTextContent(
      'N/D'
    )
  })

  it('provedores vazios: a frase de vazio e contagem 0', async () => {
    serve({
      schema: () =>
        HttpResponse.json({
          success: true,
          data: { ...schemaFixture, chatProviders: [], embedderProviders: [] }
        })
    })
    renderSettings()

    const chat = await findSection('Provedores de chat')
    expect(await within(chat).findByText('Nenhum provedor de chat disponível neste orquestrador.')).toBeInTheDocument()
    expect(within(chat).getByText('0')).toBeInTheDocument()
    expect(within(chat).queryByRole('table')).not.toBeInTheDocument()
    expect(
      within(section('Provedores de embedder')).getByText(
        'Nenhum provedor de embedder disponível neste orquestrador.'
      )
    ).toBeInTheDocument()
  })

  it('erro parcial da saúde: alerta só na seção, com código e "Tentar de novo" (que relê e atualiza o indicador)', async () => {
    let up = false
    const calls = serve({
      health: () => (up ? HttpResponse.json(runtimeBody(9)) : failure(503, 'unreachable')())
    })
    const user = userEvent.setup()
    renderSettings()

    const orchestrator = await findSection('Orquestrador')
    const alert = await within(orchestrator).findByRole('alert')
    expect(alert).toHaveTextContent(
      'Não foi possível ler a saúde do orquestrador. O restante da plataforma continua disponível.'
    )
    expect(alert).toHaveTextContent('unreachable')
    expect(within(orchestrator).queryByRole('button', { name: 'Recarregar runtime' })).not.toBeInTheDocument()
    expect(await findSection('Config store')).toHaveTextContent('Gravável')
    expect(indicator()).toHaveAccessibleName('Orquestrador fora do ar')

    up = true
    await user.click(within(alert).getByRole('button', { name: 'Tentar de novo' }))

    expect(await within(header(orchestrator)).findByText('Saudável')).toBeInTheDocument()
    expect(indicator()).toHaveAccessibleName('Orquestrador online, revisão 9')
    expect(calls).toEqual({ health: 2, schema: 1, reload: 0 })
  })

  it('erro parcial do schema: uma seção "Config store e provedores" em erro; a saúde segue; "Tentar de novo" relê só o schema', async () => {
    let up = false
    const calls = serve({
      schema: () =>
        up ? HttpResponse.json({ success: true, data: schemaFixture }) : failure(502, 'server_error')()
    })
    const user = userEvent.setup()
    renderSettings()

    const schema = await findSection('Config store e provedores')
    const alert = within(schema).getByRole('alert')
    expect(alert).toHaveTextContent('Não foi possível ler os provedores e o config store.')
    expect(alert).toHaveTextContent('SCHEMA_UNAVAILABLE')
    expect(screen.queryByRole('region', { name: 'Provedores de chat' })).not.toBeInTheDocument()
    expect(await within(header(section('Orquestrador'))).findByText('Saudável')).toBeInTheDocument()

    up = true
    await user.click(within(alert).getByRole('button', { name: 'Tentar de novo' }))

    expect(await findSection('Provedores de chat')).toBeInTheDocument()
    expect(calls).toEqual({ health: 1, schema: 2, reload: 0 })
  })

  // R4 (spec §4): o código do BFF na seção; sem ele (rede, corpo que não é do
  // BFF), o fixo.
  it.each([
    ['sessão vencida (401)', 'unauthorized', failure(401, 'unauthorized')],
    ['chave sem permissão (502)', 'forbidden', failure(502, 'forbidden')],
    ['prazo (504)', 'timeout', failure(504, 'timeout')],
    ['rede', 'ORCHESTRATOR_UNAVAILABLE', () => HttpResponse.error()],
    ['corpo que não é do BFF', 'ORCHESTRATOR_UNAVAILABLE', () => new HttpResponse('<html>', { status: 502 })],
    ['código fora do formato', 'ORCHESTRATOR_UNAVAILABLE', failure(502, '<b>pilha interna</b>')]
  ])('erro da saúde com %s: a seção mostra %s', async (_, code, respond) => {
    serve({ health: respond })
    renderSettings()

    const alert = await within(await findSection('Orquestrador')).findByRole('alert')
    expect(alert).toHaveTextContent(code)
    expect(alert).not.toHaveTextContent('pilha interna')
  })

  it('orquestrador fora: as duas seções em erro e a casca (indicador) intacta', async () => {
    serve({ health: failure(503, 'unreachable'), schema: failure(503, 'unreachable') })
    renderSettings()

    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2))
    expect(section('Orquestrador')).toHaveTextContent('unreachable')
    expect(section('Config store e provedores')).toHaveTextContent('SCHEMA_UNAVAILABLE')
    expect(indicator()).toHaveAccessibleName('Orquestrador fora do ar')
    expect(screen.getByRole('heading', { level: 1, name: 'Configurações' })).toBeInTheDocument()
  })

  it('"Atualizar" relê só a saúde e atualiza página e indicador (de online a degradado)', async () => {
    let degraded = false
    const calls = serve({
      health: () => HttpResponse.json(degraded ? runtimeBody(8, 'degraded') : runtimeBody(7))
    })
    const user = userEvent.setup()
    renderSettings()
    const orchestrator = await findSection('Orquestrador')
    await within(header(orchestrator)).findByText('Saudável')

    degraded = true
    await user.click(within(orchestrator).getByRole('button', { name: 'Atualizar' }))

    expect(await within(header(orchestrator)).findByText('Degradado')).toBeInTheDocument()
    expect(fact(orchestrator, 'Revisão do runtime')).toHaveTextContent('8')
    expect(indicator()).toHaveAccessibleName('Orquestrador degradado, revisão 8')
    expect(calls).toEqual({ health: 2, schema: 1, reload: 0 })
  })

  it('EN', async () => {
    serve({ schema: failure(503, 'unreachable') })
    renderSettings('en')

    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    const orchestrator = await findSection('Orchestrator')
    expect(await within(header(orchestrator)).findByText('Healthy')).toBeInTheDocument()
    expect(within(orchestrator).getByRole('list', { name: 'Health checks' })).toHaveTextContent(
      'Usage 42.3% · 9.1 GB free'
    )
    expect(await findSection('Config store and providers')).toHaveTextContent(
      "Couldn't read the providers and the config store."
    )
  })
})

describe('Settings: recarregar runtime', () => {
  async function openDialog() {
    const user = userEvent.setup()
    renderSettings()
    const orchestrator = await findSection('Orquestrador')
    await within(header(orchestrator)).findByText('Saudável')
    await user.click(within(orchestrator).getByRole('button', { name: 'Recarregar runtime' }))
    return { user, dialog: screen.getByRole('alertdialog', { name: 'Recarregar o runtime?' }) }
  }

  it('abre com foco em Cancelar e a revisão em vigor; Cancelar não envia nada e devolve o foco', async () => {
    serve()
    const reload = serveReload(() => HttpResponse.json({ success: true, runtimeRevision: 8 }))
    const { user, dialog } = await openDialog()

    expect(dialog).toHaveAccessibleDescription(
      'Relê a configuração do store e troca o runtime em execução. Use depois de editar o arquivo YAML. Se a nova configuração não montar, nada é alterado.'
    )
    expect(dialog).toHaveTextContent('Revisão em vigor: 7')
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus()

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(reload.count).toBe(0)
    expect(within(section('Orquestrador')).getByRole('button', { name: 'Recarregar runtime' })).toHaveFocus()
  })

  it('200: "Recarregando…" com tudo desabilitado; fecha com a revisão nova na página e no indicador, sem reler, foco no h1', async () => {
    const calls = serve()
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    const reload = serveReload(async () => {
      await held
      return HttpResponse.json({ success: true, runtimeRevision: 8 })
    })
    const { user, dialog } = await openDialog()

    await user.click(within(dialog).getByRole('button', { name: 'Recarregar runtime' }))

    expect(await within(dialog).findByRole('button', { name: 'Recarregando…' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    expect(dialog).toHaveAttribute('aria-busy', 'true')
    await user.keyboard('{Escape}')
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    release()

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(liveRegion()).toHaveTextContent('Runtime recarregado. Revisão em vigor: 8 (era 7).')
    expect(fact(section('Orquestrador'), 'Revisão do runtime')).toHaveTextContent('8')
    expect(indicator()).toHaveAccessibleName('Orquestrador online, revisão 8')
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    expect(reload.count).toBe(1)
    expect(calls.health).toBe(1)
  })

  it('a recarga com o orquestrador degradado troca só a revisão: página e indicador seguem degradados', async () => {
    serve({ health: () => HttpResponse.json(runtimeBody(7, 'degraded')) })
    serveReload(() => HttpResponse.json({ success: true, runtimeRevision: 8 }))
    const user = userEvent.setup()
    renderSettings()
    const orchestrator = await findSection('Orquestrador')
    await within(header(orchestrator)).findByText('Degradado')

    await user.click(within(orchestrator).getByRole('button', { name: 'Recarregar runtime' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Recarregar runtime' }))

    expect(await screen.findByText('Runtime recarregado. Revisão em vigor: 8 (era 7).')).toBeInTheDocument()
    expect(within(header(orchestrator)).getByText('Degradado')).toBeInTheDocument()
    expect(indicator()).toHaveAccessibleName('Orquestrador degradado, revisão 8')
  })

  it.each([
    ['502 not_confirmed (5xx do orquestrador)', failure(502, 'not_confirmed')],
    ['502 invalid_response (200 sem revisão)', failure(502, 'invalid_response')],
    ['200 sem revisão válida', () => HttpResponse.json({ success: true })]
  ])('%s: fecha com a faixa "não confirmada" e o indicador igual', async (_, respond) => {
    serve()
    serveReload(respond)
    const { user, dialog } = await openDialog()

    await user.click(within(dialog).getByRole('button', { name: 'Recarregar runtime' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(within(liveRegion()).getByRole('status')).toHaveTextContent(
      'A recarga foi pedida, mas a revisão não foi confirmada. Use Atualizar para conferir o estado.'
    )
    expect(indicator()).toHaveAccessibleName('Orquestrador online, revisão 7')
    expect(within(section('Orquestrador')).getByRole('button', { name: 'Recarregar runtime' })).toHaveFocus()
  })

  it.each([
    ['503 (orquestrador fora)', failure(503, 'unreachable')],
    ['504 (prazo)', failure(504, 'timeout')],
    ['rede', () => HttpResponse.error()]
  ])('%s: fecha com a faixa de erro', async (_, respond) => {
    serve()
    serveReload(respond)
    const { user, dialog } = await openDialog()

    await user.click(within(dialog).getByRole('button', { name: 'Recarregar runtime' }))

    expect(await within(liveRegion()).findByRole('alert')).toHaveTextContent(
      'Não foi possível falar com o orquestrador. A recarga não foi confirmada e nada foi alterado.'
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(indicator()).toHaveAccessibleName('Orquestrador online, revisão 7')
  })

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden_origin'],
    [502, 'forbidden']
  ])('%i %s: fecha com a faixa de erro e o código', async (status, error) => {
    serve()
    serveReload(failure(status, error))
    const { user, dialog } = await openDialog()

    await user.click(within(dialog).getByRole('button', { name: 'Recarregar runtime' }))

    expect(await within(liveRegion()).findByRole('alert')).toHaveTextContent(
      `Não foi possível recarregar o runtime (código ${status}).`
    )
  })

  // R1: uma ação não corre durante a outra.
  it('durante o "Atualizar", "Recarregar runtime" fica desabilitado e não abre o diálogo', async () => {
    let release!: () => void
    let reads = 0
    serve({
      health: async () => {
        reads++
        if (reads > 1) await new Promise<void>((resolve) => (release = resolve))
        return HttpResponse.json(runtimeBody(7))
      }
    })
    const user = userEvent.setup()
    renderSettings()
    const orchestrator = await findSection('Orquestrador')
    await within(header(orchestrator)).findByText('Saudável')
    const reloadButton = within(orchestrator).getByRole('button', { name: 'Recarregar runtime' })

    await user.click(within(orchestrator).getByRole('button', { name: 'Atualizar' }))

    expect(await within(orchestrator).findByRole('button', { name: 'Atualizando…' })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
    expect(reloadButton).toBeDisabled()
    await user.click(reloadButton)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    release()

    await waitFor(() => expect(reloadButton).toBeEnabled())
  })

  it('"Atualizar" tira a faixa da última recarga', async () => {
    serve()
    serveReload(failure(502, 'not_confirmed'))
    const { user, dialog } = await openDialog()
    await user.click(within(dialog).getByRole('button', { name: 'Recarregar runtime' }))
    await within(liveRegion()).findByRole('status')

    await user.click(within(section('Orquestrador')).getByRole('button', { name: 'Atualizar' }))

    await waitFor(() => expect(liveRegion()).toBeEmptyDOMElement())
  })
})
