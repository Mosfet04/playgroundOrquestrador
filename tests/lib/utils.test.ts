import { describe, expect, it } from 'vitest'

import { cn, getJsonMarkdown, isValidUrl, truncateText } from '@/lib/utils'

describe('cn', () => {
  it('junta classes e resolve conflito do tailwind pela última', () => {
    expect(cn('p-2 text-sm', false && 'hidden', 'p-4')).toBe('text-sm p-4')
  })
})

describe('truncateText', () => {
  it('devolve o texto inteiro quando cabe no limite', () => {
    expect(truncateText('agente', 6)).toBe('agente')
  })

  it('corta no limite e acrescenta ".."', () => {
    expect(truncateText('orquestrador', 5)).toBe('orque..')
  })

  it('devolve string vazia para texto vazio', () => {
    expect(truncateText('', 5)).toBe('')
  })
})

describe('isValidUrl', () => {
  it.each([
    'http://localhost:7777',
    'https://agentos.example.com',
    'http://192.168.0.10:8000/api/v1',
    'https://agentos.example.com/path?x=1&y=2#top',
    '  http://localhost:7777  '
  ])('aceita %s', (url) => {
    expect(isValidUrl(url)).toBe(true)
  })

  it.each([
    '',
    'localhost:7777',
    'ftp://agentos.example.com',
    'http://',
    'http://agentos example.com'
  ])('recusa %j', (url) => {
    expect(isValidUrl(url)).toBe(false)
  })

  // BUG-P0-02-1: a regex tem quantificadores aninhados
  // (`([a-zA-Z\d]([a-zA-Z\d-]*[a-zA-Z\d])*)`) e entra em backtracking
  // exponencial com host longo e inválido: o tempo dobra a cada caractere
  // (~0,5 s com 28; minutos com 40) e a aba congela enquanto o usuário digita
  // o endpoint. Remover o `.fails` quando a regex for corrigida.
  it.fails(
    'BUG-P0-02-1: valida host longo e inválido em tempo constante',
    () => {
      const started = performance.now()
      isValidUrl(`http://${'a'.repeat(28)}!`)
      expect(performance.now() - started).toBeLessThan(50)
    }
  )
})

describe('getJsonMarkdown', () => {
  it('formata o objeto como bloco de código json', () => {
    expect(getJsonMarkdown({ a: 1 })).toBe('```json\n{\n  "a": 1\n}\n```')
  })

  it('cai para bloco sem linguagem quando o objeto não serializa', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(getJsonMarkdown(circular)).toBe('```\n[object Object]\n```')
  })
})
