import { describe, expect, it } from 'vitest'

import { initials } from '@/lib/initials'

// P1-06 (§ 3): iniciais do avatar no cartão da entidade, na resposta e na
// conversa vazia.
describe('initials', () => {
  it.each([
    ['Suporte N1', 'suporte-n1', 'SN'],
    ['agente de vendas online', 'x', 'AD'],
    ['Assistente', 'agent-1', 'AS'],
    ['  ', 'suporte-n1', 'SU'],
    ['', 'x', 'X'],
    ['élan vital', 'x', 'ÉV'],
    ['', '', '']
  ])('%j (id %j) → %j', (name, id, expected) => {
    expect(initials(name, id)).toBe(expected)
  })
})
