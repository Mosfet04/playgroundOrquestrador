import { describe, expect, it } from 'vitest'

import { headerProblems, isSensitiveHeader } from '@/lib/toolHeaders'

// D-P3-03-3: a regra de nome sensível é a do orquestrador (duplicada de
// propósito); header sensível com valor novo em texto é recusado no cliente.

describe('isSensitiveHeader', () => {
  it.each([
    'Authorization',
    'authorization',
    'Proxy-Authorization',
    'Cookie',
    'X-Api-Key',
    'X-API-KEY',
    'x_api_key',
    'X-Token',
    'X-Auth_Token',
    ' Authorization '
  ])('%j é sensível', (name) => {
    expect(isSensitiveHeader(name)).toBe(true)
  })

  it.each(['Accept', 'Content-Type', 'X-Conta', 'Authorization-Mode', 'Set-Cookie', 'Keyboard', 'Tokens', 'Key', ''])(
    '%j não é sensível',
    (name) => {
      expect(isSensitiveHeader(name)).toBe(false)
    }
  )
})

describe('headerProblems', () => {
  const prefixes = ['env:', 'file:']
  const row = (name: string, value: string, hidden = false) => ({
    name,
    value,
    hidden,
    mode: 'text' as const,
    original: ''
  })
  const secret = (name: string, value: string, original = '') => ({
    name,
    value,
    hidden: false,
    mode: 'secret' as const,
    original
  })

  it('linhas válidas não têm problema', () => {
    expect(
      headerProblems(
        [
          row('Accept', 'application/json'),
          row('X-Api-Key', 'env:LOJA_API_KEY'),
          row('Authorization', '***', true)
        ],
        prefixes
      )
    ).toEqual([{}, {}, {}])
  })

  it('nome e valor vazios', () => {
    expect(headerProblems([row('', ''), row('X-A', '  ')], prefixes)).toEqual([
      { name: 'required', value: 'required' },
      { value: 'required' }
    ])
  })

  it('nome repetido sem diferenciar maiúscula marca a repetição, não a 1ª', () => {
    expect(
      headerProblems([row('Accept', 'a'), row('accept', 'b'), row('', 'c'), row('', 'd')], prefixes)
    ).toEqual([{}, { name: 'duplicate' }, { name: 'required' }, { name: 'required' }])
  })

  it('nome sensível com texto novo é recusado; referência e oculto passam', () => {
    expect(
      headerProblems(
        [row('Authorization', 'Bearer abc123'), row('X-Api-Token', 'env:T'), row('Cookie', '***', true)],
        prefixes
      )
    ).toEqual([{ value: 'sensitive' }, {}, {}])
  })

  it('o texto "***" digitado numa linha nova (não oculta) é texto', () => {
    expect(headerProblems([row('X-Api-Key', '***')], prefixes)).toEqual([{ value: 'sensitive' }])
  })

  it('nome comum aceita texto', () => {
    expect(headerProblems([row('X-Conta', 'valor em texto')], prefixes)).toEqual([{}])
  })

  describe('linha em modo Segredo (P3-05)', () => {
    it('referência válida passa', () => {
      expect(
        headerProblems([secret('X-Api-Key', 'env:LOJA_API_KEY'), secret('Authorization', 'file:/run/k')], prefixes)
      ).toEqual([{}, {}])
    })

    it('sem alvo: informe o alvo', () => {
      expect(headerProblems([secret('X-Api-Key', '')], prefixes)).toEqual([{ value: 'target-required' }])
    })

    it('alvo fora da regra do formato', () => {
      expect(
        headerProblems([secret('X-Api-Key', 'env:loja_key'), secret('X-B', 'file:relativo')], prefixes)
      ).toEqual([{ value: 'env' }, { value: 'file' }])
    })

    it('referência gravada fora da regra e inalterada não bloqueia; alterada, sim', () => {
      expect(
        headerProblems([secret('X-Api-Key', 'env:loja_key', 'env:loja_key')], prefixes)
      ).toEqual([{}])
      expect(
        headerProblems([secret('X-Api-Key', 'env:outra_key', 'env:loja_key')], prefixes)
      ).toEqual([{ value: 'env' }])
    })

    it('o nome sensível não pede texto: Segredo vale para qualquer nome', () => {
      expect(headerProblems([secret('X-Conta', 'env:CONTA_API_KEY')], prefixes)).toEqual([{}])
    })
  })
})
