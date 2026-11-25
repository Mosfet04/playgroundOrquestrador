import { render, screen } from '@testing-library/react'
import { NuqsTestingAdapter } from 'nuqs/adapters/testing'
import { beforeEach, describe, expect, it } from 'vitest'

import ChatInput from '@/components/playground/ChatArea/ChatInput'
import { usePlaygroundStore } from '@/store'

import { IntlProvider } from '../helpers/intl'

// QA1-04 (QA): o corte do placeholder em 24 caracteres nas fronteiras que o
// teste do dev (um nome ASCII de 42) não alcança: 24/25, emoji, acento e
// espaço antes do corte. O nome inteiro segue no rótulo acessível.

const initial = usePlaygroundStore.getState()

const placeholderFor = (name: string) => {
  usePlaygroundStore.setState({
    isOrchestratorActive: true,
    isOrchestratorLoading: false,
    agents: [{ value: 'agent-1', label: name, model: { provider: 'OpenAI', model: 'gpt-4o' } }]
  })
  render(
    <IntlProvider>
      <NuqsTestingAdapter searchParams="?agent=agent-1">
        <ChatInput />
      </NuqsTestingAdapter>
    </IntlProvider>
  )
  const textbox = screen.getByRole('textbox', { name: `Mensagem para ${name}` })
  return textbox.getAttribute('placeholder')
}

describe('placeholder do composer com nome longo (corte em 24)', () => {
  beforeEach(() => usePlaygroundStore.setState(initial, true))

  it.each([
    ['24 caracteres: sem reticências', 'a'.repeat(24), `Mensagem para ${'a'.repeat(24)}`],
    ['25 caracteres: corta e põe reticências', 'a'.repeat(25), `Mensagem para ${'a'.repeat(24)}…`],
    ['acentos contam um a um', 'é'.repeat(30), `Mensagem para ${'é'.repeat(24)}…`],
    [
      'emoji (par substituto) não é partido no corte',
      `${'a'.repeat(23)}😀😀 fim`,
      `Mensagem para ${'a'.repeat(23)}😀…`
    ],
    ['espaço antes do corte não deixa " …"', `${'a'.repeat(23)} bbbbbbbb`, `Mensagem para ${'a'.repeat(23)}…`]
  ])('%s', (_, name, expected) => {
    expect(placeholderFor(name)).toBe(expected)
  })

  it('nunca deixa meio emoji (substituto solto) no texto', () => {
    const value = placeholderFor('👩‍💻'.repeat(20)) ?? ''
    expect(value).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/)
    expect(value.endsWith('…')).toBe(true)
  })
})
