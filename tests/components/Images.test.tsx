import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import Images from '@/components/playground/ChatArea/Messages/Multimedia/Images/Images'

import { renderWithIntl } from '../helpers/intl'

// D-P1-02-4: a URL da imagem vem da saída do agente; o fallback de erro não
// pode interpretá-la como HTML.
describe('Images', () => {
  it('mostra o fallback com a URL como texto, sem injetar HTML', () => {
    const url = 'https://x.test/a.png"><img src=x id="injetado" onerror="alert(1)">'
    const { container } = renderWithIntl(<Images images={[{ url, revised_prompt: '' }]} />)

    fireEvent.error(screen.getByRole('img'))

    expect(container.querySelector('#injetado')).toBeNull()
    expect(container.querySelector('[onerror]')).toBeNull()
    expect(screen.getByText('Imagem indisponível')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: url })).toHaveAttribute('href', url)
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('mostra URL que não é http(s) só como texto, sem link', () => {
    const url = 'javascript:alert(1)'
    renderWithIntl(<Images images={[{ url, revised_prompt: '' }]} />)

    fireEvent.error(screen.getByRole('img'))

    expect(screen.getByText('Imagem indisponível')).toBeInTheDocument()
    expect(screen.getByText(url)).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
