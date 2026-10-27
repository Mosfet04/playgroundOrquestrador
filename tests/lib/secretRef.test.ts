import { describe, expect, it } from 'vitest'

import {
  isReference,
  joinReference,
  leadingReference,
  referencePrefixes,
  secretIssue,
  secretWarning,
  splitReference
} from '@/lib/secretRef'

// D-P3-05-1: a regra de `parse_secret_ref` do orquestrador, duplicada de
// propósito (o orquestrador segue como autoridade).

const prefixes = ['env:', 'file:']

describe('referencePrefixes e isReference', () => {
  it('o prefixo é o texto até o primeiro dois-pontos de cada formato', () => {
    expect(referencePrefixes(['env:<PROVEDOR>_API_KEY', 'file:<caminho em SECRETS_DIR>'])).toEqual([
      'env:',
      'file:'
    ])
  })

  it('reconhece a referência pelo prefixo', () => {
    expect(isReference('env:LOJA_API_KEY', prefixes)).toBe(true)
    expect(isReference('file:/run/secrets/x', prefixes)).toBe(true)
    expect(isReference('Bearer abc', prefixes)).toBe(false)
    expect(isReference('ENV:X', prefixes)).toBe(false)
  })
})

describe('splitReference e joinReference', () => {
  it.each([
    ['env:OPENAI_API_KEY', { prefix: 'env:', target: 'OPENAI_API_KEY' }],
    ['file:/run/secrets/key', { prefix: 'file:', target: '/run/secrets/key' }],
    ['env:openai_key', { prefix: 'env:', target: 'openai_key' }],
    ['vault:prod/openai', { prefix: 'vault:', target: 'prod/openai' }],
    ['sk-abc123', { prefix: '', target: 'sk-abc123' }],
    ['ENV:X', { prefix: '', target: 'ENV:X' }],
    ['', { prefix: '', target: '' }]
  ])('%j', (value, parts) => {
    expect(splitReference(value)).toEqual(parts)
  })

  it('monta formato + alvo sem os espaços das pontas; alvo vazio é vazio', () => {
    expect(joinReference({ prefix: 'env:', target: '  OPENAI_API_KEY ' })).toBe('env:OPENAI_API_KEY')
    expect(joinReference({ prefix: 'env:', target: '   ' })).toBe('')
    expect(joinReference({ prefix: '', target: 'sk-abc' })).toBe('sk-abc')
  })
})

describe('leadingReference', () => {
  it('separa o texto que começa por um prefixo do schema', () => {
    expect(leadingReference('env:OPENAI_API_KEY', prefixes)).toEqual({
      prefix: 'env:',
      target: 'OPENAI_API_KEY'
    })
    expect(leadingReference('file:/run/x', prefixes)).toEqual({ prefix: 'file:', target: '/run/x' })
  })

  it('texto sem prefixo do schema não separa', () => {
    expect(leadingReference('OPENAI_API_KEY', prefixes)).toBeUndefined()
    expect(leadingReference('vault:x', prefixes)).toBeUndefined()
  })
})

describe('secretIssue', () => {
  it.each([
    'env:OPENAI_API_KEY',
    'env:A_API_KEY',
    `env:A${'B'.repeat(119)}_API_KEY`,
    'file:/run/secrets/openai_key',
    'file:/'
  ])('%j é válida', (value) => {
    expect(secretIssue(value, prefixes)).toBeUndefined()
  })

  it.each([
    ['env:openai_key', 'env'],
    ['env:OPENAI_KEY', 'env'],
    ['env:1OPENAI_API_KEY', 'env'],
    ['env:_API_KEY', 'env'],
    ['env:', 'env'],
    [`env:A${'B'.repeat(120)}_API_KEY`, 'env'],
    ['env:OPENAI_API_KEY ', 'env'],
    ['file:secrets/key', 'file'],
    ['file:', 'file'],
    ['file:/a\0b', 'file'],
    ['sk-abc123', 'format'],
    ['vault:prod/openai', 'format'],
    ['ENV:OPENAI_API_KEY', 'format']
  ])('%j é recusada: %s', (value, issue) => {
    expect(secretIssue(value, prefixes)).toBe(issue)
  })

  it('só vale o formato que o schema oferece', () => {
    expect(secretIssue('env:OPENAI_API_KEY', ['file:'])).toBe('format')
  })

  it('formato do schema sem regra própria é aceito com alvo', () => {
    expect(secretIssue('vault:prod/openai', ['vault:'])).toBeUndefined()
  })
})

describe('secretWarning', () => {
  it('referência válida e vazio não têm aviso', () => {
    expect(secretWarning('env:OPENAI_API_KEY', prefixes)).toBeUndefined()
    expect(secretWarning('', prefixes)).toBeUndefined()
  })

  it('distingue sem formato, formato fora do schema e fora da regra', () => {
    expect(secretWarning('sk-abc123', prefixes)).toBe('no-format')
    expect(secretWarning('vault:prod/openai', prefixes)).toBe('unknown-format')
    expect(secretWarning('env:openai_key', prefixes)).toBe('out-of-rule')
    expect(secretWarning('file:relativo', prefixes)).toBe('out-of-rule')
  })

  it('sem formatos (schema não lido) não há aviso, nem para valor válido', () => {
    expect(secretWarning('env:OPENAI_API_KEY', [])).toBeUndefined()
    expect(secretWarning('sk-abc123', [])).toBeUndefined()
  })
})
