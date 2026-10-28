import { describe, expect, it } from 'vitest'

import { missingParams, routeOrigin, routePlaceholders, spacedPlaceholders } from '@/lib/toolRoute'

// P3-03 (D-P3-03-2): `{nome}` da rota, como o orquestrador lê em
// http_tool_factory.py; placeholder sem parâmetro de mesmo nome faz a tool ser
// descartada no runtime.

describe('routePlaceholders', () => {
  it.each([
    ['https://api.example.com/v1/orders/{order_id}', ['order_id']],
    ['https://api.example.com/{a}/x/{b}?q={a}', ['a', 'b']],
    ['https://api.example.com/{aberto', []],
    ['https://api.example.com/{}', []],
    ['https://api.example.com/{1x}', ['1x']],
    ['https://api.example.com/{order-id}', ['order-id']],
    ['https://api.example.com/{com espaco}', ['com espaco']],
    ['https://api.example.com/{a{b}', ['b']],
    ['https://api.example.com/v1', []],
    ['', []]
  ])('%j -> %j', (route, names) => {
    expect(routePlaceholders(route)).toEqual(names)
  })
})

describe('missingParams', () => {
  it('lista os placeholders sem parâmetro de mesmo nome, na ordem da rota', () => {
    expect(missingParams('https://h/{b}/{a}/{c}', ['a'])).toEqual(['b', 'c'])
  })

  it('compara a caixa exata e o parâmetro já aparado (como o BFF o grava)', () => {
    expect(missingParams('https://h/{Order}', ['order'])).toEqual(['Order'])
    expect(missingParams('https://h/{order}', ['order '])).toEqual([])
  })

  it('nada falta quando todos têm parâmetro', () => {
    expect(missingParams('https://h/{a}', ['a', 'b'])).toEqual([])
  })
})

describe('routeOrigin', () => {
  it.each([
    ['https://API.Example.com/v1/x', 'https://api.example.com'],
    ['http://h:8080/x?q=1', 'http://h:8080'],
    ['https://h', 'https://h'],
    ['https://user:pw@h/x', 'https://h']
  ])('%j -> %j', (route, origin) => {
    expect(routeOrigin(route)).toBe(origin)
  })

  it('rota sem esquema não tem origem', () => {
    expect(routeOrigin('api.example.com/x')).toBeNull()
    expect(routeOrigin('')).toBeNull()
  })

  it('a porta padrão escrita conta (https://h:443 difere de https://h)', () => {
    expect(routeOrigin('https://h:443/x')).not.toBe(routeOrigin('https://h/x'))
  })
})

describe('placeholder com espaço nas pontas', () => {
  it.each(['{ x }', '{{ x }}', '{ }', '{x }'])('%s não é criável: conta como com espaço', (placeholder) => {
    const route = `https://h/${placeholder}`
    expect(missingParams(route, [])).toEqual([])
    expect(spacedPlaceholders(route)).toHaveLength(1)
  })

  it('espaço no meio é nome válido', () => {
    expect(spacedPlaceholders('https://h/{com espaco}')).toEqual([])
    expect(missingParams('https://h/{com espaco}', [])).toEqual(['com espaco'])
  })
})
