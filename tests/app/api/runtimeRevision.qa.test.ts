// @vitest-environment node
import { http, HttpResponse } from 'msw'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as agentItem from '@/app/api/agents/[id]/route'

import { TEST_ENV } from '../../../e2e/test-env'
import { server } from '../../msw/server'

// QA P4-01: fronteiras do header `Runtime-Revision` (`^\d{1,15}$` no cliente)
// que a matriz do dev não tem: o teto de 15 dígitos vale, sinal e hexa não, e
// o espaço em volta (OWS do HTTP, que o fetch já tira) não derruba o número.

const stored = {
  id: 'x',
  nome: 'X',
  model: 'gpt-4o',
  factory_ia_model: 'openai',
  prompt: 'p',
  active: true,
  version: 3
}

async function putWithHeader(revision: string) {
  const item = `${TEST_ENV.ORCHESTRATOR_URL}/admin/config/agents/:id`
  server.use(
    http.get(item, () => HttpResponse.json(stored)),
    http.put(item, () =>
      HttpResponse.json({ ...stored, version: 4 }, { headers: { 'Runtime-Revision': revision } })
    )
  )
  const response = await agentItem.PUT(
    new NextRequest('http://playground.test/api/agents/x', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': '"3"' },
      body: JSON.stringify({ nome: 'X', model: 'gpt-4o', factoryIaModel: 'openai' })
    }),
    { params: Promise.resolve({ id: 'x' }) }
  )
  expect(response.status).toBe(200)
  return response.json()
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('QA P4-01: Runtime-Revision na fronteira', () => {
  it.each([
    ['15 dígitos (teto)', '999999999999999', 999999999999999],
    ['zeros à esquerda', '007', 7],
    ['espaço em volta (OWS)', ' 12 ', 12]
  ])('%s ⇒ runtimeRevision numérico', async (_, header, expected) => {
    expect(await putWithHeader(header)).toMatchObject({ success: true, runtimeRevision: expected })
  })

  it.each(['+1', '0x1A', '1_000'])('%j ⇒ sucesso sem runtimeRevision', async (header) => {
    const body = await putWithHeader(header)
    expect(body.success).toBe(true)
    expect(body).not.toHaveProperty('runtimeRevision')
  })
})
