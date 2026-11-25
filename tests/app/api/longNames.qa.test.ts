// @vitest-environment node
import { http, HttpResponse } from 'msw'
import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { GET as listAgents } from '@/app/api/agents/route'
import { GET as listPlaygroundAgents } from '@/app/api/playground/agents/route'

import { TEST_ENV } from '../../../e2e/test-env'
import { server } from '../../msw/server'

// QA1-04 (QA): o e2e de nomes longos entrega os dados por page.route e pula o
// BFF. Aqui o nome longo (110 caracteres, acentos, emoji, espaços e `<`) passa
// pelo BFF real e chega ao browser sem corte, sem normalização e sem rejeição:
// o truncamento é só de apresentação (CSS e placeholder), nunca nos dados.

const BASE = TEST_ENV.ORCHESTRATOR_URL
const LONG =
  'Assistente de relacionamento com o cliente para pedidos, trocas, devoluções e reembolsos em todos os canais'
const HOSTILE = `Atendimento 😀 Ação <b>x</b> ${'é'.repeat(80)}  fim`
const LONG_MODEL = 'modelo-com-nome-muito-comprido-para-testar-o-corte-do-texto-na-tela'

describe('nome longo pelo BFF', () => {
  it('seletor do playground: label e modelo chegam inteiros', async () => {
    expect(LONG.length).toBeGreaterThan(100)
    server.use(
      http.get(`${BASE}/agents`, () =>
        HttpResponse.json([
          { id: 'longo', name: LONG, model: { provider: 'ollama', model: LONG_MODEL }, sessions: {} },
          { id: 'hostil', name: HOSTILE, model: { provider: 'ollama', model: 'm' } }
        ])
      )
    )

    const { data } = await (await listPlaygroundAgents()).json()

    expect(data).toEqual([
      { value: 'longo', label: LONG, model: { provider: 'ollama', model: LONG_MODEL }, storage: true },
      { value: 'hostil', label: HOSTILE, model: { provider: 'ollama', model: 'm' }, storage: false }
    ])
  })

  it('tabela de agents: nome e modelo longos chegam inteiros', async () => {
    const doc = (id: string, nome: string, model: string) => ({
      id,
      nome,
      model,
      factory_ia_model: 'ollama',
      descricao: '',
      prompt: '',
      tools_ids: [],
      active: true,
      version: 1
    })
    server.use(
      http.get(`${BASE}/admin/config/agents`, () =>
        HttpResponse.json({
          items: [doc('longo', LONG, LONG_MODEL), doc('hostil', HOSTILE, 'm')],
          total: 2,
          offset: 0,
          limit: 200
        })
      )
    )

    const response = await listAgents(new NextRequest('http://playground.test/api/agents?limit=100'))
    const { data } = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.map((a: { nome: string; model: string }) => [a.nome, a.model])).toEqual([
      [LONG, LONG_MODEL],
      [HOSTILE, 'm']
    ])
  })
})
