import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ProviderModel } from '@/components/management/common/ProviderModel'

import { renderWithIntl } from '../helpers/intl'

// QA1-11 (#23, V1-V3): o mesmo provedor, com o mesmo rótulo, em qualquer tela:
// `Rótulo · modelo`, o modelo em mono; valor fora do mapa aparece como veio.
describe('ProviderModel', () => {
  it.each([
    ['gemini', 'Google Gemini'],
    ['google', 'Google Gemini'],
    ['Google', 'Google Gemini'],
    ['azure', 'Azure OpenAI'],
    ['azureopenai', 'Azure OpenAI'],
    ['Azure', 'Azure OpenAI'],
    ['ollama', 'Ollama'],
    ['OpenAI', 'OpenAI']
  ])('%s mostra o rótulo %s e o modelo em mono', (provider, label) => {
    renderWithIntl(<ProviderModel provider={provider} model="modelo-x" />)

    expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.getByText('modelo-x')).toHaveClass('font-mono')
    expect(screen.getByText('·')).toHaveClass('text-muted-foreground')
  })

  it('openai_compatible tem rótulo traduzido nos dois idiomas', () => {
    const { unmount } = renderWithIntl(
      <ProviderModel provider="openai_compatible" model="m" />
    )
    expect(screen.getByText('Compatível com OpenAI')).toBeInTheDocument()
    unmount()

    renderWithIntl(<ProviderModel provider="openai_compatible" model="m" />, {
      locale: 'en'
    })
    expect(screen.getByText('OpenAI-compatible')).toBeInTheDocument()
  })

  it('provedor fora do mapa aparece como veio, sem erro', () => {
    renderWithIntl(<ProviderModel provider="Fake" model="fake-model" />)

    expect(screen.getByText('Fake')).toBeInTheDocument()
    expect(screen.getByText('fake-model')).toBeInTheDocument()
  })

  it('sem modelo mostra só o rótulo; sem provedor, só o modelo', () => {
    const { container, rerender } = renderWithIntl(
      <ProviderModel provider="gemini" />
    )
    expect(container).toHaveTextContent(/^Google Gemini$/)

    rerender(<ProviderModel model="m1" />)
    expect(container).toHaveTextContent(/^m1$/)
  })
})
