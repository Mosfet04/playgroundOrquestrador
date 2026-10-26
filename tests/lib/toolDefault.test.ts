import { describe, expect, it } from 'vitest'

import { defaultText, parseDefault } from '@/lib/toolDefault'

// D-P3-03-1: o `default_value` é texto no formulário e vira o valor do tipo
// declarado (integer/float => número, boolean => booleano, object/array =>
// JSON); inválido é recusado, vazio é ausente.

describe('parseDefault', () => {
  it.each([
    ['string', 'A-1042', 'A-1042'],
    ['string', ' texto com espaço ', ' texto com espaço '],
    ['string', '10', '10'],
    ['desconhecido', 'x', 'x'],
    ['integer', '10', 10],
    ['integer', ' -3 ', -3],
    ['integer', '+7', 7],
    ['float', '0.5', 0.5],
    ['float', '3', 3],
    ['float', '.5', 0.5],
    ['float', '1e3', 1000],
    ['boolean', 'true', true],
    ['boolean', 'false', false],
    ['object', '{"loja": "SP"}', { loja: 'SP' }],
    ['array', '[1, 2]', [1, 2]]
  ])('%s %j -> %j', (type, text, value) => {
    expect(parseDefault(type, text)).toEqual({ ok: true, value })
  })

  it.each(['string', 'integer', 'float', 'boolean', 'object', 'array'])(
    '%s vazio é ausente',
    (type) => {
      expect(parseDefault(type, '')).toEqual({ ok: true, value: undefined })
    }
  )

  it.each(['integer', 'float', 'object', 'array'])('%s só com espaços é ausente', (type) => {
    expect(parseDefault(type, '   ')).toEqual({ ok: true, value: undefined })
  })

  it('boolean que não é true/false é ausente (o Select não digita)', () => {
    expect(parseDefault('boolean', 'abc')).toEqual({ ok: true, value: undefined })
  })

  it.each([
    ['integer', 'dez'],
    ['integer', '1.5'],
    ['integer', '1e3'],
    ['integer', '9007199254740993'],
    ['float', '0,5'],
    ['float', 'NaN'],
    ['float', '1e999'],
    ['object', '[1]'],
    ['object', 'null'],
    ['object', '{"a"'],
    ['object', '"texto"'],
    ['array', '["a"'],
    ['array', '{"a": 1}'],
    ['array', '5']
  ])('%s %j é recusado com o tipo no erro', (type, text) => {
    expect(parseDefault(type, text)).toEqual({ ok: false, type })
  })
})

describe('defaultText', () => {
  it.each([
    [undefined, ''],
    [null, ''],
    ['A-1042', 'A-1042'],
    [10, '10'],
    [0.5, '0.5'],
    [false, 'false'],
    [true, 'true'],
    [{ loja: 'SP' }, '{"loja":"SP"}'],
    [[1, 2], '[1,2]']
  ])('%j -> %j', (value, text) => {
    expect(defaultText(value)).toBe(text)
  })

  it('ida e volta mantém o valor tipado', () => {
    const value = { a: [1, 'x'] }
    expect(parseDefault('object', defaultText(value))).toEqual({ ok: true, value })
  })
})
