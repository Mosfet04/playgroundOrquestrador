import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { agentBodySchema } from '@/app/api/agents/schema'
import { AgentForm } from '@/components/management/agents/AgentForm'
import type { AgentConfig } from '@/types/management'

import { server } from '../msw/server'
import { SCHEMA_URL, schemaFixture } from '../msw/handlers'
import { renderWithIntl } from '../helpers/intl'

// Teste longo de interação: com a suíte em paralelo passa dos 5 s padrão.
const LONG = 15_000

// P3-02: o editor de agent cobre o documento inteiro (D-P3-02-1, D-P3-02-2):
// modelo (parâmetros do provider, URL base, referência da chave), instruções,
// execução (defaults e faixa do schema), memória e resumo. Spec:
// docs/design/P3-02.md (V-P3-02-n).

beforeAll(() => {
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
})

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

const serveSchema = (data: Partial<typeof schemaFixture>) =>
  server.use(
    http.get(SCHEMA_URL, () =>
      HttpResponse.json({ success: true, data: { ...schemaFixture, ...data } })
    )
  )

type Sent = { method: string; body: Record<string, unknown> }
function serveSave(respond?: () => Response) {
  const sent: Sent[] = []
  const handle = (method: string) => async ({ request }: { request: Request }) => {
    sent.push({ method, body: (await request.json()) as Record<string, unknown> })
    return respond ? respond() : HttpResponse.json({ success: true, data: {} })
  }
  server.use(http.post('*/api/agents', handle('POST')), http.put('*/api/agents/:id', handle('PUT')))
  return sent
}

const rejectWith = (field: string) => () =>
  HttpResponse.json({ success: false, error: 'invalid_config', field }, { status: 422 })

async function ready(element = <AgentForm agent={agent} onSuccess={() => {}} />) {
  const user = userEvent.setup()
  renderWithIntl(element)
  await waitFor(() => expect(provider()).toBeEnabled())
  return user
}

const provider = () => screen.getByRole('combobox', { name: /^Provedor \*/ })
const saveButton = () => screen.getByRole('button', { name: 'Salvar' })
const addButton = () => screen.getByRole('button', { name: 'Adicionar parâmetro' })
const paramList = () => screen.getByRole('list', { name: 'Parâmetros do modelo' })
const rows = () => within(paramList()).getAllByRole('listitem')
const optionNames = () => screen.getAllByRole('option').map((option) => option.textContent)

async function chooseProvider(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(provider())
  await user.click(screen.getByRole('option', { name }))
}

async function addParam(user: ReturnType<typeof userEvent.setup>, name: string, value: string) {
  await user.click(addButton())
  const index = within(paramList()).getAllByRole('listitem').length
  await user.click(screen.getByRole('combobox', { name: `Nome do parâmetro ${index}` }))
  await user.click(screen.getByRole('option', { name }))
  await user.type(screen.getByRole('textbox', { name: `Valor de ${name}` }), value)
}

describe('AgentForm P3-02: seções', () => {
  it('V-1: Identidade, Modelo, Instruções, Execução, RAG e Tools, nessa ordem; o prompt está em Instruções', async () => {
    await ready()

    const regions = screen.getAllByRole('region').map((region) => region.getAttribute('aria-labelledby'))
    const titles = regions.map((id) => document.getElementById(id ?? '')?.textContent)
    expect(titles).toEqual([
      'Identidade',
      'Modelo',
      'Instruções',
      'Execução',
      'Configuração RAG',
      'Tools disponíveis'
    ])
    const prompt = screen.getByRole('textbox', { name: 'Prompt do sistema' })
    expect(within(screen.getByRole('region', { name: 'Instruções' })).getByRole('textbox')).toBe(prompt)
    expect(within(screen.getByRole('region', { name: 'Modelo' })).queryByRole('textbox', { name: 'Prompt do sistema' })).toBeNull()
  })
})

describe('AgentForm P3-02: parâmetros do modelo', () => {
  it('V-5: o nome oferece os parâmetros do provedor, sem os já usados; trocar de provedor mantém as linhas', async () => {
    const user = await ready()

    await user.click(addButton())
    await user.click(screen.getByRole('combobox', { name: 'Nome do parâmetro 1' }))
    expect(optionNames()).toEqual(['temperature', 'top_p', 'stop'])
    await user.click(screen.getByRole('option', { name: 'temperature' }))
    await user.click(addButton())
    await user.click(screen.getByRole('combobox', { name: 'Nome do parâmetro 2' }))
    expect(optionNames()).toEqual(['top_p', 'stop'])
    await user.keyboard('{Escape}')

    await chooseProvider(user, 'openai')

    expect(rows()).toHaveLength(2)
    expect(screen.getByRole('combobox', { name: 'Nome do parâmetro 1' })).toHaveTextContent('temperature')
  })

  it('V-6: o chip mostra o tipo inferido e o corpo leva o valor no tipo certo', async () => {
    const sent = serveSave()
    const user = await ready()
    await addParam(user, 'temperature', '0.7')
    await addParam(user, 'top_p', 'true')
    await addParam(user, 'stop', 'FIM')

    const [temperature, topP, stop] = rows()
    expect(within(temperature).getByText('número')).toBeVisible()
    expect(within(topP).getByText('booleano')).toBeVisible()
    expect(within(stop).getByText('texto')).toBeVisible()
    const value = within(temperature).getByRole('textbox', { name: 'Valor de temperature' })
    await user.clear(value)
    expect(within(temperature).getByText('—')).toBeVisible()
    await user.type(value, '0,7')
    expect(within(temperature).getByText('texto')).toBeVisible()
    await user.clear(value)
    await user.type(value, '0.2')
    await user.click(saveButton())

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].body.model_params).toStrictEqual({ temperature: 0.2, top_p: true, stop: 'FIM' })
    expect(agentBodySchema.safeParse({ ...sent[0].body, id: 'a' }).success).toBe(true)
  }, LONG)

  it('o chip entra na descrição do valor', async () => {
    const user = await ready()
    await addParam(user, 'temperature', '0.7')

    expect(screen.getByRole('textbox', { name: 'Valor de temperature' })).toHaveAccessibleDescription(
      'número'
    )
  })

  it('remover a linha tira a chave do corpo; sem parâmetros não vai model_params', async () => {
    const sent = serveSave()
    const user = await ready(
      <AgentForm agent={{ ...agent, model_params: { temperature: 0.2 } }} onSuccess={() => {}} />
    )
    expect(screen.getByRole('textbox', { name: 'Valor de temperature' })).toHaveValue('0.2')

    await user.click(screen.getByRole('button', { name: 'Remover temperature' }))
    expect(screen.getByText('Nenhum parâmetro: o modelo usa os padrões do provedor.')).toBeVisible()
    await user.click(saveButton())

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].body.model_params ?? {}).toStrictEqual({})
  })

  it('número e booleano gravados abrem como texto e voltam no mesmo tipo', async () => {
    const sent = serveSave()
    const user = await ready(
      <AgentForm
        agent={{ ...agent, model_params: { temperature: 0.2, top_p: false, stop: 'FIM' } }}
        onSuccess={() => {}}
      />
    )
    expect(screen.getByRole('textbox', { name: 'Valor de top_p' })).toHaveValue('false')

    await user.click(saveButton())

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].body.model_params).toStrictEqual({ temperature: 0.2, top_p: false, stop: 'FIM' })
  })

  it('V-7: parâmetro gravado que o provedor não aceita fica selecionado, com aviso, e é enviado', async () => {
    const sent = serveSave()
    const user = await ready(
      <AgentForm agent={{ ...agent, model_params: { seed: 7 } }} onSuccess={() => {}} />
    )

    expect(screen.getByRole('combobox', { name: 'Nome do parâmetro 1' })).toHaveTextContent('seed')
    expect(rows()[0]).toHaveTextContent('ollama não aceita seed.')
    await user.click(saveButton())

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].body.model_params).toStrictEqual({ seed: 7 })
  })

  it('V-8: provedor sem parâmetros desabilita "Adicionar"; todos em uso também', async () => {
    const user = await ready()

    await chooseProvider(user, 'fake-llm')
    expect(screen.getByText('fake-llm não aceita parâmetros.')).toBeVisible()
    expect(addButton()).toBeDisabled()

    await chooseProvider(user, 'anthropic')
    await user.click(addButton())
    await user.click(screen.getByRole('combobox', { name: 'Nome do parâmetro 1' }))
    await user.click(screen.getByRole('option', { name: 'temperature' }))
    expect(screen.getByText('Todos os parâmetros de anthropic já estão na lista.')).toBeVisible()
    expect(addButton()).toBeDisabled()
  })

  it('linha sem nome ou sem valor: erro na linha e nada é enviado', async () => {
    const sent = serveSave()
    const user = await ready()
    await user.click(addButton())

    await user.click(saveButton())

    expect(await screen.findByText('Escolha o parâmetro · Informe o valor')).toBeVisible()
    expect(sent).toEqual([])
  })

  it('adicionar leva o foco ao nome da linha nova; remover, ao nome da seguinte', async () => {
    const user = await ready(
      <AgentForm
        agent={{ ...agent, model_params: { temperature: 0.2, top_p: 1 } }}
        onSuccess={() => {}}
      />
    )

    await user.click(addButton())
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Nome do parâmetro 3' })).toHaveFocus()
    )

    await user.click(screen.getByRole('button', { name: 'Remover temperature' }))
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Nome do parâmetro 1' })).toHaveFocus()
    )
    expect(screen.getByRole('combobox', { name: 'Nome do parâmetro 1' })).toHaveTextContent('top_p')
  })
})

describe('AgentForm P3-02: foco ao remover a última linha', () => {
  it('com "Adicionar" desabilitado, o foco vai ao título do grupo, não ao body', async () => {
    const user = await ready(
      <AgentForm
        agent={{ ...agent, factoryIaModel: 'fake-llm', model_params: { seed: 7 } }}
        onSuccess={() => {}}
      />
    )
    expect(addButton()).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Remover seed' }))

    await waitFor(() => expect(screen.getByText('Parâmetros do modelo', { selector: 'p' })).toHaveFocus())
  })

  it('com "Adicionar" habilitado, o foco vai a ele', async () => {
    const user = await ready(
      <AgentForm agent={{ ...agent, model_params: { temperature: 0.2 } }} onSuccess={() => {}} />
    )

    await user.click(screen.getByRole('button', { name: 'Remover temperature' }))

    await waitFor(() => expect(addButton()).toHaveFocus())
  })
})

describe('AgentForm P3-02: nome de provedor que é propriedade de Object', () => {
  it('provedor "constructor" gravado usa o exemplo padrão do modelo', async () => {
    await ready(<AgentForm agent={{ ...agent, factoryIaModel: 'constructor' }} onSuccess={() => {}} />)

    expect(screen.getByLabelText(/^Modelo \*/)).toHaveAttribute('placeholder', 'ex: claude-3-sonnet')
  })
})

describe('AgentForm P3-02: URL base e referência da chave', () => {
  it('V-2: provedor que exige URL base mostra o campo obrigatório; vazio não envia', async () => {
    const sent = serveSave()
    const user = await ready(<AgentForm agent={{ ...agent, factoryIaModel: 'fake-llm' }} onSuccess={() => {}} />)
    expect(screen.getByLabelText('URL base *')).toBeVisible()

    await user.click(saveButton())

    expect(await screen.findByText('fake-llm exige URL base')).toBeVisible()
    expect(screen.getByLabelText('URL base *')).toBeInvalid()
    expect(sent).toEqual([])

    await user.type(screen.getByLabelText('URL base *'), 'http://llm.local:8080/v1')
    await user.click(saveButton())
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].body.base_url).toBe('http://llm.local:8080/v1')
  })

  it('provedor que não exige URL base não mostra o campo; trocar para um que exige mostra', async () => {
    const user = await ready()

    expect(screen.queryByLabelText(/^URL base/)).toBeNull()
    await chooseProvider(user, 'fake-llm')

    expect(screen.getByLabelText('URL base *')).toBeVisible()
  })

  it('V-3: URL base gravada em provedor que não a exige fica visível, com aviso, e é enviada', async () => {
    const sent = serveSave()
    const user = await ready(
      <AgentForm agent={{ ...agent, base_url: 'http://velha/v1' }} onSuccess={() => {}} />
    )

    expect(screen.getByLabelText('URL base')).toHaveValue('http://velha/v1')
    expect(screen.getByText(/ollama não usa URL base/)).toBeVisible()
    await user.click(saveButton())

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].body.base_url).toBe('http://velha/v1')
  })

  it('apagar a URL base de um provedor que não a exige não vai no corpo, e o campo não some ao sair dele', async () => {
    const sent = serveSave()
    const user = await ready(
      <AgentForm agent={{ ...agent, base_url: 'http://velha/v1' }} onSuccess={() => {}} />
    )

    const field = screen.getByLabelText('URL base')
    await user.clear(field)
    expect(screen.getByLabelText('URL base')).toBeVisible()
    await user.tab()
    // Se sumisse no blur, o Salvar subiria entre o mousedown e o click.
    expect(screen.getByLabelText('URL base')).toBeVisible()
    expect(screen.queryByText(/não usa URL base/)).toBeNull()
    await user.click(saveButton())

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].body.base_url ?? '').toBe('')

    // Trocar de provedor é que recolhe o campo vazio.
    await chooseProvider(user, 'openai')
    expect(screen.queryByLabelText(/^URL base/)).toBeNull()
    await chooseProvider(user, 'ollama')
    expect(screen.queryByLabelText(/^URL base/)).toBeNull()
  })

  it('V-4: alvo fora da regra é recusado sem eco e sem requisição', async () => {
    const sent = serveSave()
    const user = await ready()
    const reference = screen.getByRole('textbox', { name: 'Variável de ambiente' })

    expect(reference).toHaveAttribute('type', 'text')
    expect(reference).toHaveAttribute('autocomplete', 'off')

    await user.type(reference, 'sk-segredo-colado')
    await user.click(saveButton())

    const error = await screen.findByText(/^Use MAIÚSCULAS, dígitos e _/)
    expect(error).not.toHaveTextContent('sk-segredo-colado')
    expect(reference).toBeInvalid()
    expect(sent).toEqual([])
  })

  it('referência env:/file: vai no corpo; vazia não vai', async () => {
    const sent = serveSave()
    const user = await ready()
    const reference = screen.getByRole('textbox', { name: 'Variável de ambiente' })

    await user.type(reference, 'OLLAMA_API_KEY')
    await user.click(saveButton())
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].body.api_key_ref).toBe('env:OLLAMA_API_KEY')

    await user.clear(reference)
    await user.click(saveButton())
    await waitFor(() => expect(sent).toHaveLength(2))
    expect(sent[1].body.api_key_ref ?? '').toBe('')
  })
})

describe('AgentForm P3-05: seletor de segredo no modelo', () => {
  const reference = () => screen.getByRole('textbox', { name: 'Variável de ambiente' })

  it('V-7: referência gravada fora da regra abre com aviso, sem erro; inalterada, o PUT segue', async () => {
    const sent = serveSave()
    const user = await ready(
      <AgentForm agent={{ ...agent, api_key_ref: 'env:openai_key' }} onSuccess={() => {}} />
    )

    expect(reference()).toHaveValue('openai_key')
    expect(screen.getByText(/está fora da regra do orquestrador/).closest('p')).toHaveClass('text-warning')
    expect(reference()).not.toBeInvalid()
    await user.click(saveButton())

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({ method: 'PUT', body: { api_key_ref: 'env:openai_key' } })
  })

  it('V-7: editar o alvo troca o aviso pelo erro da regra, e nada é enviado', async () => {
    const sent = serveSave()
    const user = await ready(
      <AgentForm agent={{ ...agent, api_key_ref: 'env:openai_key' }} onSuccess={() => {}} />
    )

    await user.type(reference(), '2')
    await user.click(saveButton())

    expect(await screen.findByText(/^Use MAIÚSCULAS, dígitos e _/)).toBeVisible()
    expect(screen.queryByText(/está fora da regra do orquestrador/)).toBeNull()
    expect(sent).toEqual([])
  })

  it('V-5: file: com caminho relativo é recusado; absoluto vai com o prefixo', async () => {
    const sent = serveSave()
    const user = await ready()

    await user.click(screen.getByRole('combobox', { name: 'Formato' }))
    await user.click(screen.getByRole('option', { name: 'file:' }))
    await user.type(screen.getByRole('textbox', { name: 'Caminho do arquivo' }), 'secrets/key')
    await user.click(saveButton())
    expect(await screen.findByText(/^Use um caminho absoluto, começando por \//)).toBeVisible()
    expect(sent).toEqual([])

    await user.clear(screen.getByRole('textbox', { name: 'Caminho do arquivo' }))
    await user.type(screen.getByRole('textbox', { name: 'Caminho do arquivo' }), '/run/secrets/openai_key')
    await user.click(saveButton())
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].body.api_key_ref).toBe('file:/run/secrets/openai_key')
  })

  it('V-9: com o schema lento o seletor fica desabilitado com o valor visível', async () => {
    server.use(http.get(SCHEMA_URL, () => new Promise(() => {})))
    renderWithIntl(
      <AgentForm agent={{ ...agent, api_key_ref: 'env:OLLAMA_API_KEY' }} onSuccess={() => {}} />
    )

    const model = within(screen.getByRole('region', { name: 'Modelo' }))
    expect(await model.findByText('Carregando formatos do orquestrador…')).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Formato' })).toBeDisabled()
    expect(reference()).toBeDisabled()
    expect(reference()).toHaveValue('OLLAMA_API_KEY')
    expect(screen.queryByText(/não está entre os aceitos/)).toBeNull()
    expect(model.queryByText(/está fora da regra/)).toBeNull()
  })
})

describe('AgentForm P3-02: execução', () => {
  it('V-10: agent novo mostra os defaults do schema e memória e resumo desligados', async () => {
    serveSchema({
      agent: {
        ...schemaFixture.agent,
        markdown: false,
        addDatetimeToContext: true,
        numHistoryRuns: { default: 7, minimum: 2, maximum: 20 }
      }
    })
    const sent = serveSave()
    const user = await ready(<AgentForm onSuccess={() => {}} />)
    const execution = within(screen.getByRole('region', { name: 'Execução' }))

    await waitFor(() =>
      expect(execution.getByRole('switch', { name: 'Responder em Markdown' })).not.toBeChecked()
    )
    expect(execution.getByRole('switch', { name: 'Enviar data e hora atuais' })).toBeChecked()
    expect(execution.getByRole('switch', { name: 'Enviar histórico da sessão' })).toBeChecked()
    expect(execution.getByRole('switch', { name: 'Raciocínio passo a passo' })).not.toBeChecked()
    expect(execution.getByRole('switch', { name: 'Memória do usuário' })).not.toBeChecked()
    expect(execution.getByRole('switch', { name: 'Resumo da sessão' })).not.toBeChecked()
    expect(execution.getByRole('spinbutton', { name: 'Execuções no histórico' })).toHaveValue(7)
    const defaultOf = (name: string) =>
      within(execution.getByRole('switch', { name }).closest('li') as HTMLElement)
    // schema: markdown e reasoning desligados, data/hora e histórico ligados; memória e resumo: false da entidade
    defaultOf('Responder em Markdown').getByText('Padrão: desligado')
    defaultOf('Enviar data e hora atuais').getByText('Padrão: ligado')
    defaultOf('Enviar histórico da sessão').getByText('Padrão: ligado')
    defaultOf('Raciocínio passo a passo').getByText('Padrão: desligado')
    defaultOf('Memória do usuário').getByText('Padrão: desligado')
    defaultOf('Resumo da sessão').getByText('Padrão: desligado')
    expect(execution.getAllByText('Padrão: desligado')).toHaveLength(4)
    expect(execution.getAllByText('Padrão: ligado')).toHaveLength(2)

    await user.type(screen.getByLabelText(/ID do agente/), 'novo')
    await user.type(screen.getByLabelText('Nome *'), 'Novo')
    await user.type(screen.getByLabelText(/^Modelo \*/), 'm')
    await user.click(saveButton())
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].body).toMatchObject({
      markdown: false,
      add_datetime_to_context: true,
      add_history_to_context: true,
      num_history_runs: 7,
      reasoning: false,
      user_memory_active: false,
      summary_active: false
    })
  })

  it('agent com os valores gravados reabre e salva com os mesmos', async () => {
    const sent = serveSave()
    const stored = {
      ...agent,
      model_params: { temperature: 0.2, stop: 'FIM' },
      api_key_ref: 'env:OLLAMA_API_KEY',
      markdown: false,
      add_history_to_context: false,
      num_history_runs: 12,
      add_datetime_to_context: false,
      reasoning: true,
      user_memory_active: true,
      summary_active: true
    }
    const user = await ready(<AgentForm agent={stored} onSuccess={() => {}} />)

    await user.click(saveButton())

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].method).toBe('PUT')
    expect(sent[0].body).toMatchObject({
      model_params: { temperature: 0.2, stop: 'FIM' },
      api_key_ref: 'env:OLLAMA_API_KEY',
      markdown: false,
      add_history_to_context: false,
      num_history_runs: 12,
      add_datetime_to_context: false,
      reasoning: true,
      user_memory_active: true,
      summary_active: true
    })
  })

  it('V-11: com o histórico desligado o número fica visível, desabilitado, com o valor enviado', async () => {
    const sent = serveSave()
    const user = await ready(
      <AgentForm agent={{ ...agent, num_history_runs: 12 }} onSuccess={() => {}} />
    )
    const history = screen.getByRole('switch', { name: 'Enviar histórico da sessão' })
    const runs = screen.getByRole('spinbutton', { name: 'Execuções no histórico' })
    expect(history).toHaveAttribute('aria-controls', runs.id)

    await user.click(history)

    expect(runs).toBeDisabled()
    expect(runs).toHaveValue(12)
    expect(runs).toHaveAccessibleDescription(/Ligue o histórico para usar\./)
    await user.click(saveButton())
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].body).toMatchObject({ add_history_to_context: false, num_history_runs: 12 })
  })

  it.each(['0', '51', '2.5', ''])(
    'V-11: histórico ligado e número %j fora da faixa: erro com a faixa do schema, sem envio',
    async (typed) => {
      const sent = serveSave()
      const user = await ready()
      const runs = screen.getByRole('spinbutton', { name: 'Execuções no histórico' })
      expect(runs).toHaveAttribute('min', '1')
      expect(runs).toHaveAttribute('max', '50')
      await waitFor(() => expect(runs).toHaveValue(5))

      await user.clear(runs)
      if (typed) await user.type(runs, typed)
      await user.click(saveButton())

      expect(await screen.findByText('Use um inteiro de 1 a 50')).toBeVisible()
      expect(runs).toBeInvalid()
      expect(sent).toEqual([])
    }
  )

  it('V-12: ligar o raciocínio mostra o aviso; desligar tira', async () => {
    const user = await ready()
    const warning = /Mais chamadas ao modelo por resposta/
    const reasoning = screen.getByRole('switch', { name: 'Raciocínio passo a passo' })
    expect(screen.queryByText(warning)).toBeNull()

    await user.click(reasoning)
    expect(screen.getByText(warning)).toBeVisible()
    expect(reasoning).toHaveAccessibleDescription(warning)

    await user.click(reasoning)
    expect(screen.queryByText(warning)).toBeNull()
  })

  it('V-13: carregando mostra o skeleton com status; falha mostra o texto de indisponível', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.get(SCHEMA_URL, async () => {
        await gate
        return HttpResponse.json({ success: true, data: schemaFixture })
      })
    )
    renderWithIntl(<AgentForm agent={agent} onSuccess={() => {}} />)
    const execution = screen.getByRole('region', { name: 'Execução' })

    expect(execution).toHaveAttribute('aria-busy', 'true')
    expect(within(execution).getByRole('status')).toHaveTextContent('Carregando opções do orquestrador…')
    expect(within(execution).queryByRole('switch')).toBeNull()
    expect(provider()).toBeDisabled()
    expect(addButton()).toBeDisabled()
    expect(saveButton()).toBeDisabled()

    release()
    expect(await within(execution).findByRole('switch', { name: 'Responder em Markdown' })).toBeVisible()
    expect(execution).not.toHaveAttribute('aria-busy', 'true')
  })

  it('falha no schema: Execução indisponível, sem segundo botão de tentar de novo', async () => {
    server.use(
      http.get(SCHEMA_URL, () =>
        HttpResponse.json({ success: false, error: 'unreachable' }, { status: 503 })
      )
    )
    renderWithIntl(<AgentForm agent={agent} onSuccess={() => {}} />)

    const execution = screen.getByRole('region', { name: 'Execução' })
    expect(await within(execution).findByText(/As opções de execução vêm do orquestrador/)).toBeVisible()
    expect(within(execution).queryByRole('button')).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Tentar de novo' })).toHaveLength(1)
    expect(saveButton()).toBeDisabled()
  })
})

describe('AgentForm P3-02: só leitura', () => {
  it('V-14: nada dos campos novos aceita interação', async () => {
    serveSchema({ writable: false })
    renderWithIntl(
      <AgentForm
        agent={{
          ...agent,
          model_params: { temperature: 0.2 },
          base_url: 'http://h/v1',
          api_key_ref: 'env:OLLAMA_API_KEY'
        }}
        onSuccess={() => {}}
      />
    )
    expect(await screen.findByText(/somente leitura/)).toBeVisible()
    const execution = within(screen.getByRole('region', { name: 'Execução' }))
    await waitFor(() => expect(execution.getAllByRole('switch').length).toBe(6))

    for (const control of [
      ...execution.getAllByRole('switch'),
      execution.getByRole('spinbutton'),
      screen.getByLabelText('URL base'),
      screen.getByRole('combobox', { name: 'Formato' }),
      screen.getByRole('textbox', { name: 'Variável de ambiente' }),
      screen.getByRole('textbox', { name: 'Valor de temperature' }),
      screen.getByRole('combobox', { name: 'Nome do parâmetro 1' }),
      screen.getByRole('button', { name: 'Remover temperature' }),
      addButton()
    ])
      expect(control).toBeDisabled()
    const name = screen.getByRole('combobox', { name: 'Nome do parâmetro 1' })
    fireEvent.pointerDown(name, { button: 0, ctrlKey: false, pointerType: 'mouse' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})

describe('AgentForm P3-02: recusa do orquestrador (422)', () => {
  const stored = { ...agent, model_params: { temperature: 0.2, top_p: 1 } }

  it('V-9: model_params aparece abaixo do cabeçalho do grupo, não nas linhas', async () => {
    serveSave(rejectWith('model_params'))
    const user = await ready(<AgentForm agent={stored} onSuccess={() => {}} />)

    await user.click(saveButton())

    const group = await screen.findByRole('group', { name: 'Parâmetros do modelo' })
    expect(await within(group).findByText('Valor recusado pelo orquestrador')).toBeVisible()
    expect(within(paramList()).queryByText('Valor recusado pelo orquestrador')).toBeNull()
    expect(paramList()).toHaveAccessibleDescription(/Valor recusado pelo orquestrador/)
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Valor de temperature' })).toHaveFocus()
    )
  })

  it.each([
    ['base_url', () => screen.getByLabelText('URL base')],
    ['api_key_ref', () => screen.getByRole('textbox', { name: 'Variável de ambiente' })],
    [
      'num_history_runs',
      () => screen.getByRole('spinbutton', { name: 'Execuções no histórico' })
    ]
  ])('%s recusado: erro no campo e foco nele', async (field, control) => {
    serveSave(rejectWith(field))
    const user = await ready(
      <AgentForm
        agent={{ ...agent, base_url: 'http://h/v1', api_key_ref: 'env:OLLAMA_API_KEY' }}
        onSuccess={() => {}}
      />
    )
    await waitFor(() => expect(control()).toBeEnabled())

    await user.click(saveButton())

    await waitFor(() => expect(control()).toBeInvalid())
    expect(screen.getByText('Valor recusado pelo orquestrador')).toBeVisible()
    await waitFor(() => expect(control()).toHaveFocus())
  })

  it.each([
    ['markdown', 'Responder em Markdown'],
    ['add_datetime_to_context', 'Enviar data e hora atuais'],
    ['add_history_to_context', 'Enviar histórico da sessão'],
    ['reasoning', 'Raciocínio passo a passo'],
    ['user_memory_active', 'Memória do usuário'],
    ['summary_active', 'Resumo da sessão'],
    ['active', 'Agente ativo'],
    ['rag_active', 'Habilitar RAG']
  ])('%s recusado (switch): erro no item e foco no switch', async (field, name) => {
    serveSave(rejectWith(field))
    const user = await ready()

    await user.click(saveButton())

    // Execução: o erro está no <li> do próprio item; Ativo e RAG ficam fora da lista.
    const li = (await screen.findByRole('switch', { name })).closest('li')
    const scope = li ? within(li) : screen
    expect(await scope.findByText('Valor recusado pelo orquestrador')).toBeVisible()
    if (li) expect(screen.getAllByText('Valor recusado pelo orquestrador')).toHaveLength(1)
    await waitFor(() => expect(screen.getByRole('switch', { name })).toHaveFocus())
  })

  it('num_history_runs recusado com o histórico desligado: o foco vai ao switch do histórico', async () => {
    serveSave(rejectWith('num_history_runs'))
    const user = await ready(
      <AgentForm agent={{ ...agent, add_history_to_context: false }} onSuccess={() => {}} />
    )

    await user.click(saveButton())

    expect(await screen.findByText('Valor recusado pelo orquestrador')).toBeVisible()
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Enviar histórico da sessão' })).toHaveFocus()
    )
  })
})
