import { screen, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import AppError from '@/app/(app)/error'
import { AppShell } from '@/components/layout/AppShell'
import { NotFoundState } from '@/components/layout/NotFoundState'

import { renderWithIntl } from '../helpers/intl'

// QA P1-05 (V-P1-05-15/17): entrada hostil no 404 e vazamento no error.tsx.

const route = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }))

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      media: query,
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    }) as unknown as MediaQueryList
})

describe('404: caminho hostil', () => {
  it('o caminho (<script>, <img onerror>, javascript:) aparece como texto, sem criar elemento nem link a partir dele', () => {
    route.pathname = '/<script>alert(1)</script><img src=x onerror=alert(2)>/javascript:alert(3)'
    const { container } = renderWithIntl(
      <AppShell>
        <NotFoundState />
      </AppShell>
    )

    const main = screen.getByRole('main')
    expect(within(main).getByText(route.pathname)).toHaveClass('font-mono')
    expect(container.querySelector('main script, main img')).toBeNull()
    expect(
      within(main).getAllByRole('link').map((link) => link.getAttribute('href'))
    ).toEqual(['/'])
  })

  it('em EN o 404 usa o catálogo EN', () => {
    route.pathname = '/nope'
    renderWithIntl(<NotFoundState />, { locale: 'en' })

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to home' })).toHaveAttribute('href', '/')
  })
})

describe('error.tsx: sem vazamento', () => {
  it('nem a mensagem, nem a stack, nem o nome do erro vão para a tela', () => {
    const error = Object.assign(new TypeError('mongodb://user:senha@host/db falhou'), {
      digest: 'abc123'
    })
    error.stack = 'TypeError: mongodb://user:senha@host/db falhou\n    at src/server/secret.ts:10'
    renderWithIntl(<AppError error={error} reset={() => undefined} />)

    expect(document.body.textContent).not.toMatch(/senha|mongodb:|secret\.ts|TypeError/)
    expect(screen.getByText('ref. abc123')).toBeInTheDocument()
  })

  it('digest hostil é texto, não markup', () => {
    const error = Object.assign(new Error('x'), { digest: '<img src=x onerror=alert(1)>' })
    const { container } = renderWithIntl(<AppError error={error} reset={() => undefined} />)

    expect(container.querySelector('img')).toBeNull()
  })
})
