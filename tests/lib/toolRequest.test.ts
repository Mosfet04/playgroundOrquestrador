import { describe, expect, it } from 'vitest'

import { buildRequest } from '@/lib/toolRequest'

// P3-03: a requisição que o orquestrador monta (http_tool_factory.py), sem
// chamar a rota: `{x}` pelo default percent-encoded, os demais parâmetros em
// query (GET/DELETE) ou corpo JSON (POST/PUT/PATCH), headers com a referência
// como está e o texto mascarado.

const param = (name: string, type = 'string', defaultText = '') => ({ name, type, defaultText })
const PREFIXES = ['env:', 'file:']
const build = (
  over: Partial<Parameters<typeof buildRequest>[0]> = {}
): ReturnType<typeof buildRequest> =>
  buildRequest({
    method: 'get',
    route: 'https://api.example.com/v1/orders/{order_id}',
    parameters: [],
    headers: [],
    prefixes: PREFIXES,
    ...over
  })

describe('buildRequest: chamada', () => {
  it('troca {x} pelo default com percent-encoding', () => {
    const { url } = build({ parameters: [param('order_id', 'string', 'T 77/ç')] })
    expect(url).toEqual([
      { text: 'https://api.example.com/v1/orders/' },
      { text: 'T%2077%2F%C3%A7', mark: 'default' }
    ])
  })

  it('sem default, o placeholder fica visível', () => {
    expect(build({ parameters: [param('order_id')] }).url).toEqual([
      { text: 'https://api.example.com/v1/orders/' },
      { text: '{order_id}', mark: 'placeholder' }
    ])
  })

  it('placeholder sem parâmetro também fica visível', () => {
    expect(build().url.at(-1)).toEqual({ text: '{order_id}', mark: 'placeholder' })
  })

  it('default inválido para o tipo conta como sem default', () => {
    expect(build({ parameters: [param('order_id', 'integer', 'dez')] }).url.at(-1)).toEqual({
      text: '{order_id}',
      mark: 'placeholder'
    })
  })

  it('o mesmo placeholder repetido e o resto da rota ficam como escritos', () => {
    const { url } = build({
      route: 'https://h/{a}/x?q={a}',
      parameters: [param('a', 'integer', '5')]
    })
    expect(url).toEqual([
      { text: 'https://h/' },
      { text: '5', mark: 'default' },
      { text: '/x?q=' },
      { text: '5', mark: 'default' }
    ])
  })

  it('método em caixa alta; rota sem esquema aparece como digitada', () => {
    const preview = build({ route: 'api/{x}', parameters: [param('x', 'string', 'a')] })
    expect(preview.method).toBe('GET')
    expect(preview.url).toEqual([{ text: 'api/{x}' }])
  })
})

describe('buildRequest: parâmetros fora da rota', () => {
  const parameters = [
    param('order_id', 'string', 'A-1'),
    param('include_items', 'boolean', 'true'),
    param('limit', 'integer', '10'),
    param('q', 'string', 'a b'),
    param('filtro')
  ]

  it('GET e DELETE vão em query, valor percent-encoded', () => {
    for (const method of ['GET', 'delete']) {
      const preview = build({ method, parameters })
      expect(preview.where).toBe('query')
      expect(preview.extras).toEqual([
        { name: 'include_items', value: { text: 'true', mark: 'default' } },
        { name: 'limit', value: { text: '10', mark: 'default' } },
        { name: 'q', value: { text: 'a%20b', mark: 'default' } },
        { name: 'filtro', value: { text: '{filtro}', mark: 'placeholder' } }
      ])
    }
  })

  it('POST, PUT e PATCH vão no corpo JSON, com os tipos', () => {
    for (const method of ['POST', 'put', 'PATCH']) {
      const preview = build({
        method,
        parameters: [...parameters, param('obj', 'object', '{"a":1}'), param('lista', 'array', '[1,"x"]')]
      })
      expect(preview.where).toBe('body')
      expect(preview.extras).toEqual([
        { name: 'include_items', value: { text: 'true', mark: 'default' } },
        { name: 'limit', value: { text: '10', mark: 'default' } },
        { name: 'q', value: { text: '"a b"', mark: 'default' } },
        { name: 'filtro', value: { text: '{filtro}', mark: 'placeholder' } },
        { name: 'obj', value: { text: '{"a":1}', mark: 'default' } },
        { name: 'lista', value: { text: '[1,"x"]', mark: 'default' } }
      ])
    }
  })

  it('array na query vira chave repetida; booleano na query fica true/false', () => {
    const preview = build({
      parameters: [
        param('order_id', 'string', 'A'),
        param('ids', 'array', '[1,"a b"]'),
        param('ativo', 'boolean', 'false')
      ]
    })
    expect(preview.extras).toEqual([
      { name: 'ids', value: { text: '1', mark: 'default' } },
      { name: 'ids', value: { text: 'a%20b', mark: 'default' } },
      { name: 'ativo', value: { text: 'false', mark: 'default' } }
    ])
  })

  it('booleano na rota vira True/False, como o str() do Python', () => {
    expect(build({ route: 'https://h/{ok}', parameters: [param('ok', 'boolean', 'true')] }).url.at(-1)).toEqual({
      text: 'True',
      mark: 'default'
    })
    expect(build({ route: 'https://h/{ok}', parameters: [param('ok', 'boolean', 'false')] }).url.at(-1)).toEqual({
      text: 'False',
      mark: 'default'
    })
  })

  it('o parâmetro da rota e o sem nome não entram; sem extras a lista é vazia', () => {
    const preview = build({ parameters: [param('order_id', 'string', 'A'), param('')] })
    expect(preview.extras).toEqual([])
  })
})

describe('buildRequest: headers', () => {
  it('referência e "***" como estão; texto mascarado; sem nome fica de fora', () => {
    const preview = build({
      headers: [
        { name: 'X-Api-Key', value: 'env:LOJA_API_KEY' },
        { name: 'Authorization', value: '***' },
        { name: 'Accept', value: 'application/json' },
        { name: '', value: 'x' }
      ]
    })
    expect(preview.headers).toEqual([
      { name: 'X-Api-Key', value: 'env:LOJA_API_KEY', masked: false },
      { name: 'Authorization', value: '***', masked: false },
      { name: 'Accept', value: '', masked: true }
    ])
  })

  it('o preview nunca devolve o texto do header', () => {
    const preview = build({ headers: [{ name: 'X-Conta', value: 'segredo-em-texto' }] })
    expect(JSON.stringify(preview)).not.toContain('segredo-em-texto')
  })

  it('valor vazio não é mascarado', () => {
    expect(build({ headers: [{ name: 'X-A', value: '' }] }).headers).toEqual([
      { name: 'X-A', value: '', masked: false }
    ])
  })
})
