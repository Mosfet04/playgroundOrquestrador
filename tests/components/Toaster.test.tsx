import { screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import { Toaster } from '@/components/ui/sonner'

import { renderWithIntl } from '../helpers/intl'

// D-P1-04b-1 (decisão 0012): a região de notificações do sonner tem o rótulo
// no idioma da UI (o atalho alt+T é do sonner).
beforeAll(() => {
  // O sonner lê o tema do sistema; o jsdom não implementa matchMedia.
  window.matchMedia = (query: string) =>
    ({
      media: query,
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined
    }) as unknown as MediaQueryList
})

describe('Toaster', () => {
  it.each([
    ['pt-BR', 'Notificações alt+T'],
    ['en', 'Notifications alt+T']
  ] as const)('%s: região rotulada no idioma', (locale, label) => {
    renderWithIntl(<Toaster />, { locale })

    expect(screen.getByRole('region', { name: label })).toBeInTheDocument()
  })
})
