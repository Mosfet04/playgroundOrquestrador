import { describe, expect, it } from 'vitest'

import { diffAgent } from '@/components/management/agents/agentDiff'
import { diffTeam } from '@/components/management/teams/teamDiff'
import { diffTool } from '@/components/management/tools/toolDiff'
import { boolRow, idsRow, paramsRows, textRow, withDefaults } from '@/lib/formDiff'
import type { CreateAgentForm, CreateTeamForm, CreateToolForm } from '@/types/management'

// P3-06 (D-P3-06-1): o que o diálogo de conflito lista. Rótulo = chave (o
// componente traduz); aqui só interessa quais linhas saem e o que mostram.
const label = (key: string) => key

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

  it('mesmos itens em outra ordem: as duas listas inteiras; mesma ordem: nada', () => {
    const [row] = idsRow('t', 'T', ['a', 'b'], ['b', 'a'])
    expect(row.mine).toEqual({ kind: 'order', ids: ['a', 'b'] })
    expect(row.current).toEqual({ kind: 'order', ids: ['b', 'a'] })
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
    expect(diffAgent(agent, { ...agent, id: 'b', active: false }, label)).toEqual([])
  })

  it('na ordem do formulário, com o rótulo sem o asterisco', () => {
    const rows = diffAgent(
      { ...agent, prompt: 'meu', nome: 'Meu', tools_ids: [] },
      { ...agent, prompt: 'outro', tools_ids: ['x', 'y'] },
      (key) => `${key} *`
    )
    expect(rows.map((row) => row.label)).toEqual(['name', 'systemPrompt', 'tools'])
  })
})

describe('diferenças do team', () => {
  it('membros e modo', () => {
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
    const rows = diffTeam({ ...team, mode: 'tasks' }, { ...team, member_ids: ['a', 'b'] }, label, label)
    expect(rows.map((row) => row.key)).toEqual(['member_ids', 'mode'])
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
const PREFIXES = ['env:', 'file:']

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
