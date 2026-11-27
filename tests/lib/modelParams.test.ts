import { describe, expect, it } from 'vitest'

import { isNumberText, isNumericParam, paramKind, paramValue } from '@/lib/modelParams'

// D-P3-02-2: o valor do parâmetro do modelo é texto no formulário e o tipo é
// inferido: número finito (decimal com ponto ou com uma vírgula, D-QA1-06-1),
// true/false exatos, o resto texto.

describe('paramKind e paramValue', () => {
  it.each([
    ['0.7', 'number', 0.7],
    ['3', 'number', 3],
    ['-1', 'number', -1],
    ['+2.5', 'number', 2.5],
    ['.5', 'number', 0.5],
    ['1e3', 'number', 1000],
    ['1.5E-2', 'number', 0.015],
    ['0,7', 'number', 0.7],
    ['-0,25', 'number', -0.25],
    [',5', 'number', 0.5],
    ['1,5e3', 'number', 1500],
    ['true', 'boolean', true],
    ['false', 'boolean', false],
    ['1,000.5', 'text', '1,000.5'],
    ['1.000,5', 'text', '1.000,5'],
    ['0,7,1', 'text', '0,7,1'],
    ['1,', 'text', '1,'],
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

// O `float` da tool (src/lib/toolDefault) segue só com ponto.
describe('isNumberText', () => {
  it.each([
    ['0.7', true],
    ['1e3', true],
    ['0,7', false],
    ['1e999', false],
    ['abc', false]
  ])('%j: %s', (text, expected) => {
    expect(isNumberText(text)).toBe(expected)
  })
})

// D-QA1-06-1: nomes que o provedor só aceita com número.
describe('isNumericParam', () => {
  it.each([
    'temperature',
    'top_p',
    'top_k',
    'seed',
    'frequency_penalty',
    'presence_penalty',
    'max_tokens',
    'max_output_tokens',
    'max_completion_tokens'
  ])('%s é numérico', (name) => {
    expect(isNumericParam(name)).toBe(true)
  })

  it.each(['stop', 'format', 'max', 'maxtokens', 'stop_max_x', ''])('%j não é', (name) => {
    expect(isNumericParam(name)).toBe(false)
  })
})
