import { describe, expect, it } from 'vitest'

import { paramKind, paramValue } from '@/lib/modelParams'

// D-P3-02-2: o valor do parâmetro do modelo é texto no formulário e o tipo é
// inferido: número finito (decimal com ponto), true/false exatos, o resto texto.

describe('paramKind e paramValue', () => {
  it.each([
    ['0.7', 'number', 0.7],
    ['3', 'number', 3],
    ['-1', 'number', -1],
    ['+2.5', 'number', 2.5],
    ['.5', 'number', 0.5],
    ['1e3', 'number', 1000],
    ['1.5E-2', 'number', 0.015],
    ['true', 'boolean', true],
    ['false', 'boolean', false],
    ['0,7', 'text', '0,7'],
    ['0x10', 'text', '0x10'],
    ['NaN', 'text', 'NaN'],
    ['Infinity', 'text', 'Infinity'],
    ['1e999', 'text', '1e999'],
    ['True', 'text', 'True'],
    [' 1', 'text', ' 1'],
    ['abc', 'text', 'abc'],
    ['FIM', 'text', 'FIM'],
    ['1.', 'text', '1.'],
    ['', 'empty', '']
  ])('%j é %s', (text, kind, value) => {
    expect(paramKind(text)).toBe(kind)
    expect(paramValue(text)).toBe(value)
  })
})
