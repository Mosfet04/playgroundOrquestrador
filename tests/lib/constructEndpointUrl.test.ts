import { describe, expect, it } from 'vitest'

import { constructEndpointUrl } from '@/lib/constructEndpointUrl'

describe('constructEndpointUrl', () => {
  it.each([null, undefined, ''])('devolve vazio para %j', (value) => {
    expect(constructEndpointUrl(value)).toBe('')
  })

  it.each([
    ['http://localhost:7777', 'http://localhost:7777'],
    ['https://agentos.example.com', 'https://agentos.example.com']
  ])('mantém o protocolo informado em %s', (value, expected) => {
    expect(constructEndpointUrl(value)).toBe(expected)
  })

  it.each([
    ['localhost:7777', 'http://localhost:7777'],
    ['127.0.0.1:8000', 'http://127.0.0.1:8000']
  ])('usa http para host local ou IP (%s)', (value, expected) => {
    expect(constructEndpointUrl(value)).toBe(expected)
  })

  it('usa https para os demais hosts', () => {
    expect(constructEndpointUrl('agentos.example.com')).toBe(
      'https://agentos.example.com'
    )
  })

  it('decodifica o valor vindo codificado', () => {
    expect(constructEndpointUrl('localhost%3A7777')).toBe(
      'http://localhost:7777'
    )
  })
})
