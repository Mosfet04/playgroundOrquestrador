import { describe, expect, it } from 'vitest'

import { escapeRegExp } from '@/lib/utils'

describe('escapeRegExp', () => {
  it.each(['.*(a+)+$', '[a-z]', 'a|b', '^início', 'fim$', '\\d', '{2,3}', 'a?b'])(
    'o resultado para %j casa exatamente o texto original',
    (text) => {
      const pattern = new RegExp(`^${escapeRegExp(text)}$`)

      expect(pattern.test(text)).toBe(true)
    }
  )

  it('não deixa o texto casar como regex', () => {
    expect(new RegExp(escapeRegExp('a.c')).test('abc')).toBe(false)
    expect(new RegExp(escapeRegExp('(a+)+$')).test('aaaa')).toBe(false)
  })

  it('devolve texto sem metacaracteres e texto vazio como vieram', () => {
    expect(escapeRegExp('agente 01')).toBe('agente 01')
    expect(escapeRegExp('')).toBe('')
  })
})
