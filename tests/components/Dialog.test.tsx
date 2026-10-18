import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

import { renderWithIntl } from '../helpers/intl'

// D-P1-04b-3 (decisão 0012): o botão de fechar dos modais tem nome no idioma
// da UI (modal de sessão do playground e excluir do editor da gestão).
describe('DialogContent', () => {
  it.each([
    ['pt-BR', 'Fechar'],
    ['en', 'Close']
  ] as const)('%s: botão de fechar com nome no idioma', (locale, name) => {
    renderWithIntl(
      <Dialog open>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>X</DialogTitle>
        </DialogContent>
      </Dialog>,
      { locale }
    )

    expect(screen.getByRole('button', { name })).toBeInTheDocument()
  })
})
