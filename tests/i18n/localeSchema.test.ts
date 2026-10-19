import { describe, expect, it } from 'vitest'

import { parseLocale } from '@/i18n/localeSchema'

// Decisão 0011: o idioma vem do cookie; sem cookie (ou com valor fora da
// lista) é sempre pt-BR, sem olhar o Accept-Language.
describe('parseLocale', () => {
  it.each([
    ['pt-BR', 'pt-BR'],
    ['en', 'en']
  ])('%s -> %s', (value, expected) => {
    expect(parseLocale(value)).toBe(expected)
  })

  it.each([undefined, '', 'EN', 'en-US', 'pt', 'fr', 'pt-BR; en'])(
    'valor inválido (%s) -> pt-BR',
    (value) => {
      expect(parseLocale(value)).toBe('pt-BR')
    }
  )
})
