import { describe, expect, it } from 'vitest'

import { providerKey } from '@/lib/providerKey'

// QA1-11 (#23, D-QA1-11-2): o id gravado, o alias e o nome de classe do agno
// caem na mesma entrada do mapa; o que não está nele devolve undefined (a tela
// mostra o valor como veio).
describe('providerKey', () => {
  it.each([
    ['ollama', 'ollama'],
    ['Ollama', 'ollama'],
    ['openai', 'openai'],
    ['OpenAI', 'openai'],
    ['anthropic', 'anthropic'],
    ['Anthropic', 'anthropic'],
    ['groq', 'groq'],
    ['Groq', 'groq'],
    ['gemini', 'gemini'],
    ['google', 'google'],
    ['Google', 'google'],
    ['azure', 'azure'],
    ['Azure', 'azure'],
    ['azureopenai', 'azureopenai'],
    ['openai_compatible', 'openai_compatible']
  ])('%s → %s', (raw, key) => {
    expect(providerKey(raw)).toBe(key)
  })

  it('ignora espaços nas pontas', () => {
    expect(providerKey('  Gemini ')).toBe('gemini')
  })

  it.each(['Fake', 'fake-llm', '', 'constructor', '__proto__', 'toString'])(
    'valor fora do mapa (%j) → undefined, sem casar com propriedade de Object',
    (raw) => {
      expect(providerKey(raw)).toBeUndefined()
    }
  )
})
