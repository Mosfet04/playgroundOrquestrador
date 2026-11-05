import { describe, expect, it } from 'vitest'

import { agentUpdateSchema } from '@/app/api/agents/schema'
import { teamUpdateSchema } from '@/app/api/teams/schema'
import { toolBodySchema } from '@/app/api/tools/schema'
import { diffAgent } from '@/components/management/agents/agentDiff'
import {
  readValues as agentRead,
  toFormValues as agentForm,
  toPayload as agentPayload
} from '@/components/management/agents/agentFormValues'
import { diffTeam } from '@/components/management/teams/teamDiff'
import {
  readValues as teamRead,
  toFormValues as teamForm,
  toPayload as teamPayload
} from '@/components/management/teams/teamFormValues'
import { diffTool } from '@/components/management/tools/toolDiff'
import { toFormValues as toolForm, toPayload as toolPayload } from '@/components/management/tools/toolFormValues'
import { boolRow, changedWindow, idsRow, paramsRows, secretRow, textRow, withDefaults } from '@/lib/formDiff'
import type {
  AgentConfig,
  ConfigSchema,
  CreateAgentForm,
  CreateTeamForm,
  CreateToolForm,
  TeamConfig,
  Tool
} from '@/types/management'

import { schemaFixture } from '../msw/handlers'

// P3-06 (D-P3-06-1): o que o diálogo de conflito lista. Rótulo = chave (o
// componente traduz); aqui só interessa quais linhas saem e o que mostram.
const label = (key: string) => key
const PREFIXES = ['env:', 'file:']

describe('linhas de diferença', () => {
  it('texto igual não gera linha; vazio, ausente e NaN são o mesmo', () => {
    expect(textRow('a', 'A', 'x', 'x')).toEqual([])
    expect(textRow('a', 'A', '', undefined)).toEqual([])
    expect(textRow('a', 'A', NaN, undefined)).toEqual([])
    expect(textRow('a', 'A', 'x', 'y')).toHaveLength(1)
  })

  it('booleano ausente vale desligado', () => {
    expect(boolRow('a', 'A', undefined, false)).toEqual([])
    expect(boolRow('a', 'A', true, undefined)).toHaveLength(1)
  })

  it('conjunto: só os itens que faltam do outro lado e quantos são iguais', () => {
    const [row] = idsRow('t', 'T', ['a', 'b', 'c'], ['b', 'c', 'd'])
    expect(row.mine).toEqual({ kind: 'ids', ids: ['a'], same: 2 })
    expect(row.current).toEqual({ kind: 'ids', ids: ['d'], same: 2 })
  })

  // D-P4-02-4: a UI são caixas de seleção; a ordem é a do clique.
  it('mesmos itens em qualquer ordem não geram linha', () => {
    expect(idsRow('t', 'T', ['a', 'b'], ['b', 'a'])).toEqual([])
    expect(idsRow('t', 'T', ['a', 'b'], ['a', 'b'])).toEqual([])
  })

  it('lista por chave: uma linha por chave que difere, "ausente" no lado sem a chave', () => {
    const rows = paramsRows('p', 'Parâmetros', { a: 1, b: 2, c: true }, { b: '2', c: false, d: 'x' })
    expect(rows.map((row) => [row.item, row.mine.kind, row.current.kind])).toEqual([
      ['a', 'text', 'absent'],
      ['c', 'text', 'text'],
      ['d', 'absent', 'text']
    ])
  })

  it('withDefaults só preenche o que falta', () => {
    type Values = { a?: boolean; b: boolean; n: number }
    const values: Values = { a: undefined, b: false, n: NaN }
    expect(withDefaults(values, { a: true, b: true, n: 3 })).toEqual({
      a: true,
      b: false,
      n: 3
    })
  })
})

describe('chave de API (P4-02 §5.1)', () => {
  const prefixes = ['env:', 'file:']

  it('referência dentro da regra aparece como está; fora da regra, nunca', () => {
    const [row] = secretRow('k', 'K', 'env:OPENAI_API_KEY', 'sk-legado-colado', prefixes)
    expect(row.mine).toEqual({ kind: 'text', text: 'env:OPENAI_API_KEY', mono: true, long: false })
    expect(row.current).toEqual({ kind: 'secretText' })
    expect(JSON.stringify(row)).not.toContain('sk-legado-colado')
  })

  it('os dois fora da regra e diferentes: linha mascarada dos dois lados', () => {
    const [row] = secretRow('k', 'K', 'env:minusculo', 'sk-outro', prefixes)
    expect(row.mine).toEqual({ kind: 'secretText' })
    expect(row.current).toEqual({ kind: 'secretText' })
  })

  it('vazio é vazio, não segredo; igual não gera linha', () => {
    const [row] = secretRow('k', 'K', '', 'file:/run/k', prefixes)
    expect(row.mine).toEqual({ kind: 'text', text: '', mono: true, long: false })
    expect(row.current).toEqual({ kind: 'text', text: 'file:/run/k', mono: true, long: false })
    expect(secretRow('k', 'K', 'sk-igual', 'sk-igual', prefixes)).toEqual([])
    expect(secretRow('k', 'K', undefined, '', prefixes)).toEqual([])
  })

  it('sem formatos conhecidos, tudo preenchido fica mascarado', () => {
    const [row] = secretRow('k', 'K', 'env:OPENAI_API_KEY', '', [])
    expect(row.mine).toEqual({ kind: 'secretText' })
  })
})

// D-P4-02-3: recolhido, a coluna mostra a janela que começa uma linha antes da
// primeira que difere.
describe('janela do texto longo', () => {
  const lines = (count: number) => Array.from({ length: count }, (_, line) => `l${line}`)
  const text = (values: string[]) => values.join('\n')

  it('diferença na 1ª linha: começa nela, sem linhas puladas', () => {
    expect(changedWindow(text(['x', ...lines(9)]), text(lines(10)))).toEqual({
      skipped: 0,
      mine: 'x\nl0\nl1\nl2',
      current: 'l0\nl1\nl2\nl3'
    })
  })

  it('diferença na 2ª linha: a 1ª é o contexto, sem marcador', () => {
    const edited = lines(10)
    edited[1] = 'x'
    expect(changedWindow(text(edited), text(lines(10)))).toMatchObject({ skipped: 0, mine: 'l0\nx\nl2\nl3' })
  })

  it('diferença no meio: uma linha de contexto e o número de linhas iguais acima', () => {
    const edited = lines(12)
    edited[7] = 'x'
    expect(changedWindow(text(edited), text(lines(12)))).toEqual({
      skipped: 6,
      mine: 'l6\nx\nl8\nl9',
      current: 'l6\nl7\nl8\nl9'
    })
  })

  it('diferença na última linha: a janela só tem o que resta', () => {
    const edited = lines(10)
    edited[9] = 'x'
    expect(changedWindow(text(edited), text(lines(10)))).toEqual({
      skipped: 8,
      mine: 'l8\nx',
      current: 'l8\nl9'
    })
  })

  it('um texto é prefixo do outro: a janela do mais curto para na última linha dele', () => {
    expect(changedWindow(text(lines(5)), text(lines(8)))).toEqual({
      skipped: 4,
      mine: 'l4',
      current: 'l4\nl5\nl6\nl7'
    })
  })

  // D-P4-02-5: a janela conta linhas lógicas e o corte de 4 linhas conta linhas
  // visuais (cerca de 120 caracteres na coluna): o trecho igual longo sai.
  describe('trecho igual longo antes da diferença', () => {
    const seed =
      'You are an expert programming assistant. You help developers with code review, debugging, writing clean code, explaining complex programming concepts, and providing best practices. You are knowledgeable in multiple programming languages and frameworks.'

    it('linha única longa com a mudança no fim: as duas caixas cortam o começo com "…", na mesma posição', () => {
      const edited = seed.replace('frameworks.', 'EDITADO.')
      const view = changedWindow(edited, seed)

      expect(view.skipped).toBe(0)
      expect(view.mine).toBe(`…${edited.slice(edited.indexOf('EDITADO') - 40)}`)
      expect(view.current).toBe(`…${seed.slice(seed.indexOf('frameworks') - 40)}`)
      expect(view.mine.indexOf('EDITADO')).toBe(41)
    })

    it('linha de contexto longa acima da mudança: o corte alcança a linha da mudança, e o marcador segue', () => {
      const context = 'c'.repeat(180)
      const before = ['igual', 'igual', context, 'linha original', 'depois'].join('\n')
      const after = ['igual', 'igual', context, 'linha editada', 'depois'].join('\n')
      const view = changedWindow(after, before)

      expect(view.skipped).toBe(2)
      // Em comum: o contexto, a quebra e "linha ".
      expect(view.mine).toBe(`…${'c'.repeat(33)}\nlinha editada\ndepois`)
      expect(view.current).toBe(`…${'c'.repeat(33)}\nlinha original\ndepois`)
    })

    it('até 40 caracteres iguais não corta', () => {
      const same = 'x'.repeat(40)
      expect(changedWindow(`${same}a`, `${same}b`)).toEqual({ skipped: 0, mine: `${same}a`, current: `${same}b` })
    })

    it('41 iguais: mantém os 40 mais próximos da diferença', () => {
      const same = `y${'x'.repeat(40)}`
      expect(changedWindow(`${same}a`, `${same}b`)).toEqual({
        skipped: 0,
        mine: `…${'x'.repeat(40)}a`,
        current: `…${'x'.repeat(40)}b`
      })
    })

    it('um texto é prefixo do outro numa linha longa: o mais curto fica só com o trecho final', () => {
      const view = changedWindow(seed, `${seed} Mais texto.`)
      expect(view.mine).toBe(`…${seed.slice(-40)}`)
      expect(view.current).toBe(`…${seed.slice(-40)} Mais texto.`)
    })

    it('o corte não parte um emoji', () => {
      const same = `${'x'.repeat(10)}😀${'y'.repeat(39)}`
      const view = changedWindow(`${same}a`, `${same}b`)
      expect(view.mine).toBe(`…${'y'.repeat(39)}a`)
      expect(view.mine.isWellFormed()).toBe(true)
    })
  })

  it('um lado vazio: janela no começo dos dois', () => {
    expect(changedWindow('', text(lines(6)))).toEqual({ skipped: 0, mine: '', current: 'l0\nl1\nl2\nl3' })
  })
})

const agent: CreateAgentForm = {
  id: 'a',
  nome: 'Alfa',
  model: 'gpt',
  factoryIaModel: 'openai',
  descricao: '',
  prompt: 'p',
  active: true,
  tools_ids: ['x'],
  rag_active: false,
  markdown: true,
  api_key_ref: 'env:OPENAI_API_KEY'
}

describe('diferenças do agent', () => {
  it('iguais ⇒ nada; id e active nunca entram', () => {
    expect(diffAgent(agent, { ...agent, id: 'b', active: false }, label, PREFIXES)).toEqual([])
  })

  it('na ordem do formulário, com o rótulo sem o asterisco', () => {
    const rows = diffAgent(
      { ...agent, prompt: 'meu', nome: 'Meu', tools_ids: [] },
      { ...agent, prompt: 'outro', tools_ids: ['x', 'y'] },
      (key) => `${key} *`,
      PREFIXES
    )
    expect(rows.map((row) => row.label)).toEqual(['name', 'systemPrompt', 'tools'])
  })

  it('duas chamadas com os mesmos dados dão a mesma lista na mesma ordem', () => {
    const mine = { ...agent, prompt: 'meu', nome: 'Meu', tools_ids: ['y'], model_params: { b: 1, a: 2 } }
    const keys = () => diffAgent(mine, agent, label, PREFIXES).map((row) => row.key)
    expect(keys()).toEqual(['nome', 'model_params:b', 'model_params:a', 'prompt', 'tools_ids'])
    expect(keys()).toEqual(keys())
  })

  it('api_key_ref e rag_api_key_ref fora da regra aparecem mascarados', () => {
    const rows = diffAgent(
      { ...agent, api_key_ref: 'env:OPENAI_API_KEY', rag_active: true, rag_api_key_ref: 'sk-rag-digitado' },
      { ...agent, api_key_ref: 'sk-legado', rag_active: true },
      label,
      PREFIXES
    )
    expect(rows.find((row) => row.key === 'api_key_ref')?.current).toEqual({ kind: 'secretText' })
    expect(rows.find((row) => row.key === 'rag_api_key_ref')?.mine).toEqual({ kind: 'secretText' })
    expect(JSON.stringify(rows)).not.toMatch(/sk-legado|sk-rag-digitado/)
  })
})

describe('diferenças do team', () => {
  const team: CreateTeamForm = {
    id: 't',
    nome: 'T',
    descricao: '',
    prompt: '',
    active: true,
    member_ids: ['a'],
    mode: 'route',
    factoryIaModel: 'openai',
    model: 'm'
  }

  it('membros e modo', () => {
    const rows = diffTeam({ ...team, mode: 'tasks' }, { ...team, member_ids: ['a', 'b'] }, label, label, PREFIXES)
    expect(rows.map((row) => row.key)).toEqual(['member_ids', 'mode'])
  })

  it('api_key_ref fora da regra aparece mascarada', () => {
    const rows = diffTeam(
      { ...team, api_key_ref: 'sk-team-legado' },
      { ...team, api_key_ref: 'env:OPENAI_API_KEY' },
      label,
      label,
      PREFIXES
    )
    expect(rows[0].mine).toEqual({ kind: 'secretText' })
    expect(JSON.stringify(rows)).not.toContain('sk-team-legado')
  })
})

const tool: CreateToolForm = {
  id: 'c',
  name: 'Clima',
  description: 'd',
  route: 'https://x.test/{cidade}',
  http_method: 'GET',
  headers: {},
  parameters: [],
  active: true
}

describe('diferenças da tool: segredos', () => {
  it('header em texto nunca mostra o valor, referência e *** ficam como estão', () => {
    const rows = diffTool(
      { ...tool, headers: { A: 'segredo-digitado', B: 'env:B_API_KEY', C: '***', D: 'igual' } },
      { ...tool, headers: { A: 'outro-segredo', B: 'file:/run/b', C: 'env:C_API_KEY', D: 'igual' } },
      label,
      PREFIXES
    )
    expect(rows.map((row) => [row.item, row.mine, row.current])).toEqual([
      ['A', { kind: 'secretText' }, { kind: 'secretText' }],
      ['B', { kind: 'ref', text: 'env:B_API_KEY' }, { kind: 'ref', text: 'file:/run/b' }],
      ['C', { kind: 'stored' }, { kind: 'ref', text: 'env:C_API_KEY' }]
    ])
    expect(JSON.stringify(rows)).not.toMatch(/segredo-digitado|outro-segredo/)
  })

  it('parâmetros por nome: tipo, obrigatório, padrão e descrição', () => {
    const parameter = { name: 'cidade', type: 'string', description: 'Cidade', required: true }
    const rows = diffTool(
      { ...tool, parameters: [{ ...parameter, default_value: 'SP' }, { ...parameter, name: 'uf' }] },
      { ...tool, parameters: [{ ...parameter, required: false }, { ...parameter, name: 'uf' }] },
      label,
      PREFIXES
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].item).toBe('cidade')
    expect(rows[0].mine).toEqual({
      kind: 'param',
      type: 'string',
      required: true,
      fallback: 'SP',
      description: 'Cidade'
    })
  })
})

// P4-02 §7: o formulário aberto sem tocar não gera linha. `mine` é o que o
// formulário tem depois dos efeitos de abertura; `current`, a versão lida.
describe('documento cru e formulário sem tocar (§7)', () => {
  const schema = schemaFixture as unknown as ConfigSchema
  const prefixes = ['env:', 'file:']
  const strategy = schema.ragSearchStrategies[0]
  const embedder = schema.embedderProviders[0].name

  const rawAgent: AgentConfig = {
    id: 'a',
    nome: 'A',
    model: 'm',
    factoryIaModel: 'ollama',
    descricao: '',
    prompt: 'p',
    active: true,
    tools_ids: ['t1', 't2'],
    version: 1
  }
  // O que os efeitos do AgentForm fazem ao abrir, com o schema pronto.
  const opened = (doc: AgentConfig) => ({
    ...agentForm(doc),
    markdown: doc.markdown ?? schema.agent.markdown,
    add_datetime_to_context: doc.add_datetime_to_context ?? schema.agent.addDatetimeToContext,
    add_history_to_context: doc.add_history_to_context ?? schema.agent.addHistoryToContext,
    reasoning: doc.reasoning ?? schema.agent.reasoning,
    num_history_runs: doc.num_history_runs ?? schema.agent.numHistoryRuns.default,
    rag_factoryIaModel: doc.rag_config?.factoryIaModel || embedder,
    rag_search_strategy: doc.rag_config?.search_strategy || strategy
  })
  const diff = (mine: ReturnType<typeof opened>, doc: AgentConfig, toolIds = doc.tools_ids) =>
    diffAgent(
      agentPayload(mine, toolIds),
      agentPayload(agentRead(doc, schema), doc.tools_ids),
      label,
      prefixes
    )

  it('agent sem execução e sem RAG: nenhuma linha', () => {
    expect(diff(opened(rawAgent), rawAgent)).toEqual([])
  })

  it('num_history_runs nulo no documento: nenhuma linha; apagado pelo usuário (NaN): linha com "Depois" vazio', () => {
    const nulled = { ...rawAgent, num_history_runs: null } as unknown as AgentConfig
    expect(diff({ ...opened(nulled), num_history_runs: null } as never, nulled)).toEqual([])
    const rows = diff({ ...opened(rawAgent), num_history_runs: NaN }, rawAgent)
    expect(rows.map((row) => row.key)).toEqual(['num_history_runs'])
    expect(rows[0].mine).toMatchObject({ text: '' })
  })

  it('agent sem rag_config, RAG ligado depois: uma linha por campo do RAG, com "Antes" vazio', () => {
    const rows = diff({ ...opened(rawAgent), rag_active: true, rag_doc_name: 'd', rag_model: 'e' }, rawAgent)
    expect(rows.map((row) => [row.key, row.current])).toEqual([
      ['rag_active', { kind: 'bool', on: false }],
      ['rag_doc_name', expect.objectContaining({ kind: 'text', text: '' })],
      ['rag_search_strategy', expect.objectContaining({ kind: 'text', text: '' })],
      ['rag_factoryIaModel', expect.objectContaining({ kind: 'text', text: '' })],
      ['rag_model', expect.objectContaining({ kind: 'text', text: '' })]
    ])
  })

  it('RAG ligado com o provedor padrão igual ao fallback do formulário continua listando o provedor', () => {
    const mine = { ...opened(rawAgent), rag_active: true, rag_factoryIaModel: 'openai' }
    expect(diff(mine, rawAgent).map((row) => row.key)).toContain('rag_factoryIaModel')
  })

  it('ligar e desligar o RAG sem preencher nada: nenhuma linha', () => {
    expect(diff({ ...opened(rawAgent), rag_active: false }, rawAgent)).toEqual([])
  })

  it('rag_config gravada sem estratégia: o padrão do efeito não vira linha', () => {
    const doc: AgentConfig = {
      ...rawAgent,
      rag_config: { active: true, doc_name: 'd', model: 'e', factoryIaModel: 'openai' }
    }
    expect(diff({ ...opened(doc), rag_factoryIaModel: 'openai' }, doc)).toEqual([])
  })

  it('rag_config gravada sem provedor: o padrão do efeito não vira linha', () => {
    const doc = {
      ...rawAgent,
      rag_config: { active: true, doc_name: 'd', model: 'e', search_strategy: strategy }
    } as AgentConfig
    expect(diff(opened(doc), doc)).toEqual([])
  })

  it('tools marcadas em outra ordem: nenhuma linha', () => {
    expect(diff(opened(rawAgent), rawAgent, ['t2', 't1'])).toEqual([])
  })

  it('team sem execução: nenhuma linha; membros em outra ordem também não', () => {
    const doc: TeamConfig = {
      id: 't',
      nome: 'T',
      descricao: '',
      prompt: '',
      active: true,
      member_ids: ['a', 'b'],
      mode: 'route',
      factoryIaModel: 'openai',
      model: 'm',
      version: 1
    }
    const mine = {
      ...teamForm(doc),
      markdown: schema.team.markdown,
      add_history_to_context: schema.team.addHistoryToContext,
      member_ids: ['b', 'a']
    }
    expect(diffTeam(teamPayload(mine), teamPayload(teamRead(doc, schema)), label, label, prefixes)).toEqual([])
  })

  it('tool: *** volta como veio e parâmetro da rota é obrigatório nos dois lados', () => {
    const doc: Tool = {
      id: 'c',
      name: 'C',
      description: 'd',
      route: 'https://x.test/{cidade}',
      http_method: 'GET',
      parameters: [{ name: 'cidade', type: 'string', description: 'x', required: false }],
      headers: { 'X-Key': '***', 'X-Ref': 'env:X_API_KEY' },
      active: true,
      version: 1
    }
    const payload = toolPayload(toolForm(doc))
    expect(payload.parameters[0].required).toBe(true)
    expect(payload.headers['X-Key']).toBe('***')
    expect(payload.headers['X-Ref']).toBe('env:X_API_KEY')
    expect(diffTool(payload, toolPayload(toolForm(doc)), label, prefixes)).toEqual([])
  })
})

// B1 (D-P4-02-6): a carga apara o que o BFF apara. A `schema.ts` de cada rota é a
// autoridade: passar a carga por ela não pode mudar nada. Vale para os campos com
// espaço nas fixtures abaixo: se um deles passar a ser aparado lá sem estar no
// `toPayload`, quebra aqui. Campo novo precisa entrar na fixture com espaço.
describe('o que o BFF apara', () => {
  const pad = (value: string) => `  ${value}  `
  const ragDoc = {
    active: true,
    doc_name: pad('doc'),
    model: pad('embed'),
    factoryIaModel: pad('openai'),
    search_strategy: pad('semantic'),
    base_url: pad('http://rag'),
    api_key_ref: pad('env:RAG_API_KEY'),
    model_params: { [pad('dimensions')]: 3 }
  }
  const paddedAgent: AgentConfig = {
    id: 'a',
    nome: pad('Nome'),
    model: pad('m'),
    factoryIaModel: pad('ollama'),
    descricao: pad('descrição'),
    prompt: pad('prompt'),
    active: true,
    tools_ids: [pad('t')],
    base_url: pad('http://h'),
    api_key_ref: pad('env:X_API_KEY'),
    model_params: { [pad('temperature')]: 1 },
    rag_config: ragDoc,
    version: 1
  }

  it('agent: a carga já é o que o BFF deixaria; prompt, descrição e o resto do RAG seguem como digitados', () => {
    const payload = agentPayload(agentForm(paddedAgent), paddedAgent.tools_ids)

    expect(payload).toMatchObject(agentUpdateSchema.parse(payload))
    expect(payload).toMatchObject({
      nome: 'Nome',
      base_url: 'http://h',
      rag_api_key_ref: 'env:RAG_API_KEY',
      prompt: pad('prompt'),
      descricao: pad('descrição'),
      rag_doc_name: pad('doc'),
      rag_model: pad('embed'),
      tools_ids: [pad('t')]
    })
    expect(Object.keys(payload.model_params ?? {})).toEqual(['temperature'])
  })

  it('team: idem, com os membros', () => {
    const doc: TeamConfig = {
      id: 't',
      nome: pad('Time'),
      descricao: pad('descrição'),
      prompt: pad('prompt'),
      active: true,
      member_ids: [pad('a')],
      mode: pad('route'),
      factoryIaModel: pad('openai'),
      model: pad('m'),
      base_url: pad('http://h'),
      api_key_ref: pad('env:X_API_KEY'),
      model_params: { [pad('temperature')]: 1 },
      version: 1
    }
    const payload = teamPayload(teamForm(doc))

    expect(payload).toMatchObject(teamUpdateSchema.parse(payload))
    expect(payload).toMatchObject({ nome: 'Time', member_ids: ['a'], prompt: pad('prompt'), descricao: pad('descrição') })
  })

  it('tool: nome, descrição e parâmetro; rota e instruções seguem como digitadas', () => {
    const doc: Tool = {
      id: 'c',
      name: pad('Clima'),
      description: pad('Previsão'),
      route: pad('https://x.test/v1'),
      http_method: pad('GET'),
      instructions: pad('use assim'),
      parameters: [{ name: pad('p'), type: pad('string'), description: pad('P'), required: false }],
      headers: { 'X-Conta': pad('valor') },
      active: true,
      version: 1
    }
    const payload = toolPayload(toolForm(doc))

    expect(payload).toMatchObject(toolBodySchema.parse(payload))
    expect(payload).toMatchObject({
      name: 'Clima',
      description: 'Previsão',
      route: pad('https://x.test/v1'),
      http_method: pad('GET'),
      instructions: pad('use assim'),
      headers: { 'X-Conta': pad('valor') }
    })
  })

  it('espaço no nome não é alteração; no prompt, é (senão a mudança real some da lista)', () => {
    const doc = { ...paddedAgent, nome: 'Nome', prompt: 'p', descricao: '', rag_config: undefined }
    const form = agentForm(doc)
    const rows = (values: typeof form) =>
      diffAgent(agentPayload(values, doc.tools_ids), agentPayload(form, doc.tools_ids), label, PREFIXES)

    expect(rows({ ...form, nome: 'Nome ' })).toEqual([])
    expect(rows({ ...form, prompt: 'p ' }).map((row) => row.key)).toEqual(['prompt'])
  })
})

describe('\\r\\n na comparação (B3)', () => {
  it('\\r\\n e \\n são iguais; a mudança real segue na lista, com a janela na linha certa', () => {
    expect(textRow('p', 'P', 'a\nb', 'a\r\nb', { long: true })).toEqual([])
    expect(textRow('p', 'P', 'a\nb\nc', 'a\rb\rc', { long: true })).toEqual([])
    const [row] = textRow('p', 'P', 'a\nb\nc\nd\nEDITADO', 'a\r\nb\r\nc\r\nd\r\ne', { long: true })
    const text = (cell: typeof row.mine) => (cell.kind === 'text' ? cell.text : '')

    expect(changedWindow(text(row.mine), text(row.current))).toEqual({
      skipped: 3,
      mine: 'd\nEDITADO',
      current: 'd\ne'
    })
  })
})

describe('valor padrão inválido gravado (B5)', () => {
  const invalid = { name: 'p', type: 'integer', description: 'P', required: false, default_value: 'dez' }
  const doc: Tool = {
    id: 'c',
    name: 'C',
    description: 'd',
    route: 'https://x.test/',
    http_method: 'GET',
    parameters: [invalid],
    active: true,
    version: 1
  }
  const form = toolForm(doc)
  const diff = (values: typeof form) => diffTool(toolPayload(values), toolPayload(form), label, PREFIXES)

  it('sem tocar não vira linha; apagado, a linha mostra o valor que sai', () => {
    expect(diff(form)).toEqual([])
    const [row] = diff({ ...form, parameters: [{ ...form.parameters[0], default_text: '' }] })

    expect(row.current).toMatchObject({ kind: 'param', fallback: 'dez' })
    expect(row.mine).toMatchObject({ kind: 'param', fallback: '' })
  })
})
