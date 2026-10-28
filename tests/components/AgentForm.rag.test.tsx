import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { agentBodySchema } from '@/app/api/agents/schema'
import { AgentForm } from '@/components/management/agents/AgentForm'
import type { AgentConfig } from '@/types/management'

import { renderWithIntl } from '../helpers/intl'
import { stubBrowserApis } from '../helpers/toolForm'
import { SCHEMA_URL, schemaFixture } from '../msw/handlers'
import { server } from '../msw/server'

// Teste longo de interação: com a suíte em paralelo passa dos 5 s padrão.
const LONG = 15_000

// P3-05 (D-P3-05-2, D-P3-05-3): o RAG com o documento inteiro, desligável sem
// perder os valores. Spec: docs/design/P3-05.md §4 (V-P3-05-11..19).

beforeAll(stubBrowserApis)

beforeEach(() =>
  server.use(
    http.get('*/api/tools', () =>
      HttpResponse.json({
        success: true,
        data: { data: [], total: 0, page: 1, limit: 100, totalPages: 1 }
      })
    )
  )
)

const agent: AgentConfig = {
  id: 'assistente',
  nome: 'Assistente',
  model: 'm1',
  factoryIaModel: 'ollama',
  descricao: '',
  prompt: 'Seja útil.',
  active: true,
  tools_ids: [],
  version: 3
}

const rag = {
  active: true,
  doc_name: 'catalogo',
  model: 'text-embedding-3-small',
  factoryIaModel: 'openai',
  search_strategy: 'hierarchical',
  model_params: { dimensions: 512 },
  api_key_ref: 'env:EMBED_API_KEY'
}
const withRag = (patch: Partial<NonNullable<AgentConfig['rag_config']>> = {}): AgentConfig => ({
  ...agent,
  rag_config: { ...rag, ...patch }
})

const serveSchema = (data: Partial<typeof schemaFixture>) =>
  server.use(
    http.get(SCHEMA_URL, () =>
      HttpResponse.json({ success: true, data: { ...schemaFixture, ...data } })
    )
  )

type Sent = { method: string; body: Record<string, unknown> }
function serveSave(respond?: () => Response) {
  const sent: Sent[] = []
  const handle =
    (method: string) =>
    async ({ request }: { request: Request }) => {
      sent.push({ method, body: (await request.json()) as Record<string, unknown> })
      return respond ? respond() : HttpResponse.json({ success: true, data: {} })
    }
  server.use(http.post('*/api/agents', handle('POST')), http.put('*/api/agents/:id', handle('PUT')))
  return sent
}

const rejectWith = (field: string) => () =>
  HttpResponse.json({ success: false, error: 'invalid_config', field }, { status: 422 })

async function ready(element: React.ReactElement = <AgentForm agent={withRag()} onSuccess={() => {}} />) {
  const user = userEvent.setup()
  renderWithIntl(element)
  await waitFor(() => expect(screen.getByRole('combobox', { name: /^Provedor \*/ })).toBeEnabled())
  return user
}

const card = () => within(screen.getByRole('region', { name: 'Configuração RAG' }))
const toggle = () => card().getByRole('switch', { name: 'Habilitar RAG' })
const doc = () => card().getByRole('textbox', { name: 'Nome do documento *' })
const strategy = () => card().getByRole('combobox', { name: 'Estratégia de busca *' })
const embedderProvider = () => card().getByRole('combobox', { name: 'Provedor de embedding *' })
const embedderModel = () => card().getByRole('textbox', { name: 'Modelo de embedding *' })
const ref = () => card().getByRole('textbox', { name: 'Variável de ambiente' })
const save = () => screen.getByRole('button', { name: 'Salvar' })
const optionNames = () => screen.getAllByRole('option').map((option) => option.textContent)

async function pick(user: ReturnType<typeof userEvent.setup>, select: HTMLElement, name: string) {
  await user.click(select)
  await user.click(screen.getByRole('option', { name }))
}

describe('RagSection: campos (V-11..V-15)', () => {
  it('V-11: switch, documento | estratégia, subgrupo Embedder, referência e parâmetros, nessa ordem', async () => {
    await ready()

    const embedder = card().getByRole('group', { name: 'Embedder' })
    const order = [
      toggle(),
      doc(),
      strategy(),
      embedder,
      embedderProvider(),
      embedderModel(),
      card().getByRole('group', { name: 'Referência da chave do embedder' }),
      card().getByRole('group', { name: 'Parâmetros do embedder' })
    ]
    for (let index = 1; index < order.length; index++)
      expect(
        order[index - 1].compareDocumentPosition(order[index]) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
    expect(within(embedder).getByRole('combobox', { name: 'Provedor de embedding *' })).toBeInTheDocument()
    expect(toggle()).toBeChecked()
    expect(toggle()).toHaveAccessibleDescription(
      'Desligue para pausar o RAG sem perder a configuração.'
    )
  })

  it('reabre com os mesmos valores gravados', async () => {
    await ready()

    expect(doc()).toHaveValue('catalogo')
    expect(strategy()).toHaveTextContent('hierarchical')
    expect(embedderProvider()).toHaveTextContent('openai')
    expect(embedderModel()).toHaveValue('text-embedding-3-small')
    expect(ref()).toHaveValue('EMBED_API_KEY')
    expect(card().getByRole('combobox', { name: 'Formato' })).toHaveTextContent('env:')
    expect(card().getByRole('textbox', { name: 'Valor de dimensions' })).toHaveValue('512')
  })

  it('V-12: a estratégia lista as do schema; a gravada fora fica selecionada e na lista; RAG novo abre com a 1ª', async () => {
    const user = await ready(<AgentForm agent={withRag({ search_strategy: 'legacy_mmr' })} onSuccess={() => {}} />)

    expect(strategy()).toHaveTextContent('legacy_mmr')
    await user.click(strategy())
    expect(optionNames()).toEqual(['semantic', 'hierarchical', 'legacy_mmr'])
    await user.keyboard('{Escape}')
  })

  it('V-12: agent sem RAG abre com a 1ª estratégia do schema', async () => {
    const user = await ready(<AgentForm agent={agent} onSuccess={() => {}} />)

    await user.click(toggle())
    expect(strategy()).toHaveTextContent('semantic')
  })

  it('V-13: o nome do parâmetro lista só os do embedder; sem parâmetros avisa e desabilita Adicionar', async () => {
    const user = await ready()
    const add = () => card().getByRole('button', { name: 'Adicionar parâmetro' })

    // openai: só `dimensions`, que já está na lista.
    expect(card().getByRole('group', { name: 'Parâmetros do embedder' })).toHaveTextContent(
      'Todos os parâmetros de openai já estão na lista.'
    )
    expect(add()).toBeDisabled()

    await pick(user, embedderProvider(), 'fake-embed')
    expect(add()).toBeEnabled()
    await user.click(add())
    await user.click(card().getByRole('combobox', { name: 'Nome do parâmetro 2' }))
    expect(optionNames()).toEqual(['truncate'])
    await user.keyboard('{Escape}')

    await pick(user, embedderProvider(), 'ollama')
    expect(card().getByRole('group', { name: 'Parâmetros do embedder' })).toHaveTextContent(
      'ollama não aceita parâmetros.'
    )
    // O gravado que o provedor não aceita fica, com aviso.
    expect(card().getAllByText(/ollama não aceita/).length).toBeGreaterThan(0)
    expect(add()).toBeDisabled()
  })

  it('V-13: sem parâmetros mostra o texto do embedder', async () => {
    await ready(<AgentForm agent={withRag({ model_params: undefined })} onSuccess={() => {}} />)

    expect(card().getByText('Nenhum parâmetro: o embedder usa os padrões do provedor.')).toBeVisible()
  })

  it('V-14: embedder que exige URL base mostra o campo em linha inteira, obrigatório; vazio não envia', async () => {
    const sent = serveSave()
    const user = await ready()

    expect(card().queryByLabelText(/^URL base/)).toBeNull()
    await pick(user, embedderProvider(), 'fake-embed')

    const baseUrl = card().getByLabelText('URL base *')
    expect(baseUrl).toBeVisible()
    expect(baseUrl.closest('div')).toHaveClass('md:col-span-2')
    await user.click(save())

    expect(await card().findByText('fake-embed exige URL base')).toHaveClass('text-destructive')
    expect(baseUrl).toBeInvalid()
    expect(sent).toEqual([])
  })

  it('URL base de embedder que não a exige, gravada, fica visível com aviso e é enviada', async () => {
    const sent = serveSave()
    const user = await ready(
      <AgentForm agent={withRag({ base_url: 'http://embed.local/v1' })} onSuccess={() => {}} />
    )

    expect(card().getByLabelText('URL base')).toHaveValue('http://embed.local/v1')
    expect(card().getByText(/openai não usa URL base/)).toBeVisible()
    await user.click(save())

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].body).toMatchObject({ rag_base_url: 'http://embed.local/v1' })
  })

  it('V-15: RAG ligado e vazio: pede documento e modelo, com foco no primeiro', async () => {
    const sent = serveSave()
    const user = await ready(<AgentForm agent={agent} onSuccess={() => {}} />)

    await user.click(toggle())
    await user.click(save())

    expect(await card().findByText('Informe o nome do documento')).toBeVisible()
    expect(card().getByText('Informe o modelo de embedding')).toBeVisible()
    await waitFor(() => expect(doc()).toHaveFocus())
    expect(sent).toEqual([])
  })
})

describe('RagSection: salvar o documento inteiro (D-P3-05-2)', () => {
  it('agent com RAG completo: o corpo leva estratégia, parâmetros, URL base e referência, e o schema do BFF o aceita', async () => {
    const sent = serveSave()
    const user = await ready(<AgentForm agent={agent} onSuccess={() => {}} />)

    await user.click(toggle())
    await user.type(doc(), 'manual')
    await pick(user, strategy(), 'hierarchical')
    await pick(user, embedderProvider(), 'fake-embed')
    await user.type(embedderModel(), 'bge-small')
    await user.type(card().getByLabelText('URL base *'), 'http://embed.local:8080/v1')
    await user.type(ref(), 'EMBED_API_KEY')
    await user.click(card().getByRole('button', { name: 'Adicionar parâmetro' }))
    await user.click(card().getByRole('combobox', { name: 'Nome do parâmetro 1' }))
    await user.click(screen.getByRole('option', { name: 'dimensions' }))
    await user.type(card().getByRole('textbox', { name: 'Valor de dimensions' }), '384')
    await user.click(save())

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].body).toMatchObject({
      rag_active: true,
      rag_doc_name: 'manual',
      rag_search_strategy: 'hierarchical',
      rag_factoryIaModel: 'fake-embed',
      rag_model: 'bge-small',
      rag_base_url: 'http://embed.local:8080/v1',
      rag_api_key_ref: 'env:EMBED_API_KEY',
      rag_model_params: { dimensions: 384 }
    })
    expect(agentBodySchema.omit({ id: true }).safeParse(sent[0].body).success).toBe(true)
  }, LONG)

  it('editar mantém os valores gravados no corpo', async () => {
    const sent = serveSave()
    const user = await ready()

    await user.click(save())

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({ method: 'PUT' })
    expect(sent[0].body).toMatchObject({
      rag_active: true,
      rag_doc_name: 'catalogo',
      rag_search_strategy: 'hierarchical',
      rag_factoryIaModel: 'openai',
      rag_model: 'text-embedding-3-small',
      rag_api_key_ref: 'env:EMBED_API_KEY',
      rag_model_params: { dimensions: 512 }
    })
  })

  it('estratégia e provedor gravados fora do schema voltam como estavam', async () => {
    const sent = serveSave()
    const user = await ready(
      <AgentForm
        agent={withRag({ search_strategy: 'legacy_mmr', factoryIaModel: 'Fake' })}
        onSuccess={() => {}}
      />
    )

    expect(embedderProvider()).toHaveTextContent('Fake')
    await user.click(save())

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].body).toMatchObject({
      rag_search_strategy: 'legacy_mmr',
      rag_factoryIaModel: 'Fake'
    })
  })
})

describe('RagSection: referência da chave do embedder (D-P3-05-1, D-P3-05-5)', () => {
  it('V-1: o mesmo seletor do modelo, com a ajuda e o "Vazio" do embedder', async () => {
    await ready(<AgentForm agent={agent} onSuccess={() => {}} />)
    const user = userEvent.setup()
    await user.click(toggle())

    const group = card().getByRole('group', { name: 'Referência da chave do embedder' })
    expect(within(group).getByRole('combobox', { name: 'Formato' })).toHaveTextContent('env:')
    expect(group).toHaveTextContent('Só a referência, nunca a chave.')
    expect(group).toHaveTextContent('Vazio: o embedder não define chave própria.')
    expect(group).toHaveClass('md:col-span-2')
  })

  it('alvo fora da regra: erro no campo, sem eco e sem requisição', async () => {
    const sent = serveSave()
    const user = await ready()

    await user.clear(ref())
    await user.type(ref(), 'embed_key')
    await user.click(save())

    const error = await card().findByText(/^Use MAIÚSCULAS, dígitos e _/)
    expect(error).not.toHaveTextContent('embed_key')
    expect(ref()).toBeInvalid()
    await waitFor(() => expect(ref()).toHaveFocus())
    expect(sent).toEqual([])
  })

  it('gravada fora da regra e inalterada: aviso, e o envio segue', async () => {
    const sent = serveSave()
    const user = await ready(
      <AgentForm agent={withRag({ api_key_ref: 'env:embed_key' })} onSuccess={() => {}} />
    )

    expect(card().getByText(/está fora da regra do orquestrador/)).toBeVisible()
    await user.click(save())

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].body).toMatchObject({ rag_api_key_ref: 'env:embed_key' })
  })

  it('422 em rag_api_key_ref: erro abaixo do par e foco no alvo', async () => {
    serveSave(rejectWith('rag_api_key_ref'))
    const user = await ready()

    await user.click(save())

    expect(await card().findByText('Valor recusado pelo orquestrador')).toBeVisible()
    expect(ref()).toBeInvalid()
    await waitFor(() => expect(ref()).toHaveFocus())
  })
})

describe('RagSection: 422 por campo (V-P3-05, §4)', () => {
  it.each([
    ['rag_doc_name', () => doc()],
    ['rag_model', () => embedderModel()],
    ['rag_search_strategy', () => strategy()],
    ['rag_factoryIaModel', () => embedderProvider()]
  ])('%s recusado: erro no campo e foco nele', async (field, control) => {
    serveSave(rejectWith(field))
    const user = await ready()

    await user.click(save())

    expect(await card().findByText('Valor recusado pelo orquestrador')).toBeVisible()
    await waitFor(() => expect(control()).toHaveFocus())
    expect(control()).toBeInvalid()
  })

  it('rag_base_url recusado: erro no campo e foco nele', async () => {
    serveSave(rejectWith('rag_base_url'))
    const user = await ready(
      <AgentForm agent={withRag({ base_url: 'http://embed.local/v1' })} onSuccess={() => {}} />
    )

    await user.click(save())

    await waitFor(() => expect(card().getByLabelText('URL base')).toBeInvalid())
    await waitFor(() => expect(card().getByLabelText('URL base')).toHaveFocus())
  })

  it('rag_model_params recusado: erro no grupo e foco no 1º valor', async () => {
    serveSave(rejectWith('rag_model_params'))
    const user = await ready()

    await user.click(save())

    const group = card().getByRole('group', { name: 'Parâmetros do embedder' })
    expect(await within(group).findByText('Valor recusado pelo orquestrador')).toBeVisible()
    await waitFor(() => expect(card().getByRole('textbox', { name: 'Valor de dimensions' })).toHaveFocus())
  })
})

describe('RagSection: desligar sem perder (D-P3-05-3, V-16..V-18)', () => {
  it('V-16: desligar recolhe os campos e mostra o resumo; religar volta aos mesmos valores', async () => {
    const user = await ready()

    await user.click(toggle())

    expect(card().queryByRole('textbox', { name: 'Nome do documento *' })).toBeNull()
    expect(card().queryByRole('combobox', { name: 'Estratégia de busca *' })).toBeNull()
    expect(
      card().getByText(/RAG desligado\. Os valores ficam guardados e voltam ao religar:/)
    ).toBeVisible()
    expect(card().getByText('catalogo · openai/text-embedding-3-small · hierarchical')).toBeVisible()
    expect(card().getByRole('button', { name: 'Descartar valores' })).toBeVisible()

    await user.click(toggle())

    expect(doc()).toHaveValue('catalogo')
    expect(strategy()).toHaveTextContent('hierarchical')
    expect(embedderModel()).toHaveValue('text-embedding-3-small')
    expect(ref()).toHaveValue('EMBED_API_KEY')
    expect(card().getByRole('textbox', { name: 'Valor de dimensions' })).toHaveValue('512')
    expect(card().queryByRole('button', { name: 'Descartar valores' })).toBeNull()
  })

  it('V-16: salvar desligado envia rag_active false com os valores', async () => {
    const sent = serveSave()
    const user = await ready()

    await user.click(toggle())
    await user.click(save())

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].body).toMatchObject({
      rag_active: false,
      rag_doc_name: 'catalogo',
      rag_model: 'text-embedding-3-small',
      rag_factoryIaModel: 'openai',
      rag_search_strategy: 'hierarchical',
      rag_api_key_ref: 'env:EMBED_API_KEY',
      rag_model_params: { dimensions: 512 }
    })
  })

  it('V-16: o RAG gravado desligado abre desligado, com o resumo', async () => {
    await ready(<AgentForm agent={withRag({ active: false })} onSuccess={() => {}} />)

    expect(toggle()).not.toBeChecked()
    expect(card().getByText('catalogo · openai/text-embedding-3-small · hierarchical')).toBeVisible()
  })

  it('V-16: sem nada preenchido mostra só o texto de RAG desligado e envia sem valores', async () => {
    const sent = serveSave()
    const user = await ready(<AgentForm agent={agent} onSuccess={() => {}} />)

    expect(card().getByText('RAG desligado: o agente responde sem base de conhecimento.')).toBeVisible()
    expect(card().queryByRole('button', { name: 'Descartar valores' })).toBeNull()
    await user.click(save())

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].body).toMatchObject({ rag_active: false, rag_doc_name: '', rag_model: '' })
    expect(sent[0].body.rag_api_key_ref).toBe('')
    expect(sent[0].body.rag_model_params).toEqual({})
  })

  it('V-17: Descartar valores limpa tudo, devolve o foco ao switch e o corpo seguinte não leva valores', async () => {
    const sent = serveSave()
    const user = await ready(<AgentForm agent={withRag({ active: false })} onSuccess={() => {}} />)

    await user.click(card().getByRole('button', { name: 'Descartar valores' }))

    expect(card().getByText('RAG desligado: o agente responde sem base de conhecimento.')).toBeVisible()
    expect(card().queryByRole('button', { name: 'Descartar valores' })).toBeNull()
    expect(toggle()).toHaveFocus()
    expect(
      card().getByText('Valores do RAG descartados. Salvar remove a configuração.')
    ).toBeInTheDocument()

    await user.click(save())
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].body).toMatchObject({
      rag_active: false,
      rag_doc_name: '',
      rag_model: '',
      rag_api_key_ref: '',
      rag_base_url: '',
      rag_model_params: {}
    })
  })

  it('V-18: desligado, um 422 em rag_api_key_ref reabre os campos com a nota e foca o campo', async () => {
    serveSave(rejectWith('rag_api_key_ref'))
    const user = await ready(<AgentForm agent={withRag({ active: false })} onSuccess={() => {}} />)

    await user.click(save())

    expect(
      await card().findByText(
        'RAG desligado, com campos mostrados porque um deles tem erro. Os valores continuam guardados.'
      )
    ).toBeVisible()
    expect(toggle()).not.toBeChecked()
    expect(await card().findByText('Valor recusado pelo orquestrador')).toBeVisible()
    await waitFor(() => expect(ref()).toHaveFocus())
    expect(doc()).toHaveValue('catalogo')
    // Com os campos à mostra, o resumo dos valores guardados sai (O1).
    expect(card().queryByText(/Os valores ficam guardados e voltam ao religar/)).toBeNull()
    expect(card().queryByRole('button', { name: 'Descartar valores' })).toBeNull()
  })

  it('V-18: editada com o RAG ligado e fora da regra, ao desligar e salvar reabre os campos, sem requisição', async () => {
    const sent = serveSave()
    const user = await ready()

    await user.clear(ref())
    await user.type(ref(), 'embed_key')
    await user.click(toggle())
    expect(card().queryByRole('textbox', { name: 'Variável de ambiente' })).toBeNull()
    await user.click(save())

    expect(await card().findByText(/^Use MAIÚSCULAS, dígitos e _/)).toBeVisible()
    await waitFor(() => expect(ref()).toHaveFocus())
    expect(sent).toEqual([])
    expect(toggle()).not.toBeChecked()
  })

  it('R1: desligado, embedder que exige URL base sem URL não bloqueia (o orquestrador decide)', async () => {
    const sent = serveSave()
    const user = await ready(
      <AgentForm
        agent={withRag({ active: false, factoryIaModel: 'fake-embed', model_params: undefined })}
        onSuccess={() => {}}
      />
    )

    await user.click(save())

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(card().queryByText('fake-embed exige URL base')).toBeNull()
    expect(sent[0].body).toMatchObject({ rag_active: false, rag_factoryIaModel: 'fake-embed' })
  })

  it('R1: desligado, linha de parâmetro incompleta não bloqueia e não vai no corpo', async () => {
    const sent = serveSave()
    const user = await ready(
      <AgentForm
        agent={withRag({ factoryIaModel: 'fake-embed', base_url: 'http://embed.local/v1' })}
        onSuccess={() => {}}
      />
    )

    await user.click(card().getByRole('button', { name: 'Adicionar parâmetro' }))
    await user.click(toggle())
    await user.click(save())

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].body.rag_model_params).toEqual({ dimensions: 512 })
  })

  it('R2: sem nenhum valor, desligado, os campos nem são montados; ligar os monta', async () => {
    const user = await ready(<AgentForm agent={agent} onSuccess={() => {}} />)

    expect(document.getElementById('rag_doc_name')).toBeNull()
    await user.click(toggle())
    expect(document.getElementById('rag_doc_name')).not.toBeNull()
  })

  it('desligado, o que o orquestrador decide não é exigido no cliente (documento e modelo vazios passam)', async () => {
    const sent = serveSave()
    const user = await ready(<AgentForm agent={withRag({ active: false, doc_name: 'so-o-doc', model: '' })} onSuccess={() => {}} />)

    await user.click(save())

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].body).toMatchObject({ rag_active: false, rag_doc_name: 'so-o-doc', rag_model: '' })
  })

  it('ligar o switch fecha os campos reabertos e tira a nota', async () => {
    serveSave(rejectWith('rag_api_key_ref'))
    const user = await ready(<AgentForm agent={withRag({ active: false })} onSuccess={() => {}} />)
    await user.click(save())
    await card().findByText(/com campos mostrados porque um deles tem erro/)

    await user.click(toggle())

    expect(card().queryByText(/com campos mostrados porque um deles tem erro/)).toBeNull()
    expect(toggle()).toBeChecked()
  })
})

describe('RagSection: schema e só leitura (V-19)', () => {
  it('carregando: estratégia, provedor e formato desabilitados e Salvar desabilitado', async () => {
    server.use(http.get(SCHEMA_URL, () => new Promise(() => {})))
    renderWithIntl(<AgentForm agent={withRag()} onSuccess={() => {}} />)

    await waitFor(() => expect(strategy()).toBeDisabled())
    expect(embedderProvider()).toBeDisabled()
    expect(card().getByRole('combobox', { name: 'Formato' })).toBeDisabled()
    expect(doc()).toBeEnabled()
    expect(toggle()).toBeEnabled()
    expect(save()).toBeDisabled()
    expect(screen.getByRole('region', { name: 'Configuração RAG' })).toHaveAttribute('aria-busy', 'true')
  })

  it('falha: aviso do RAG, selects desabilitados e Salvar desabilitado', async () => {
    server.use(http.get(SCHEMA_URL, () => HttpResponse.json({ success: false }, { status: 503 })))
    renderWithIntl(<AgentForm agent={withRag()} onSuccess={() => {}} />)

    expect(
      await card().findByText('As opções do RAG vêm do orquestrador. Use “Tentar de novo” no aviso acima.')
    ).toBeVisible()
    expect(strategy()).toBeDisabled()
    expect(embedderProvider()).toBeDisabled()
    expect(save()).toBeDisabled()
  })

  it('só leitura: nada editável, valores e referência visíveis', async () => {
    serveSchema({ writable: false })
    renderWithIntl(<AgentForm agent={withRag()} onSuccess={() => {}} />)

    await screen.findByText(/somente leitura/)
    await waitFor(() => expect(strategy()).toBeDisabled())
    expect(toggle()).toBeDisabled()
    expect(embedderProvider()).toBeDisabled()
    expect(card().getByRole('combobox', { name: 'Formato' })).toBeDisabled()
    expect(ref()).toBeDisabled()
    expect(doc()).toBeDisabled()
    expect(card().getByText('env:EMBED_API_KEY')).toBeVisible()
    expect(doc()).toHaveValue('catalogo')
  })
})
