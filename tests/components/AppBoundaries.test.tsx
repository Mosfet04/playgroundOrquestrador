import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import AppError from '@/app/(app)/error'
import { AppShell } from '@/components/layout/AppShell'
import { NotFoundState } from '@/components/layout/NotFoundState'

import { renderWithIntl } from '../helpers/intl'

// P1-05 (V-P1-05-15/17): error.tsx e o 404 de rota dentro da casca de (app).

const route = vi.hoisted(() => ({ pathname: '/rota-inexistente' }))
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

describe('error.tsx de (app)', () => {
  it('bloco com a referência do digest, foco em "Tentar de novo" e nunca a mensagem do erro', async () => {
    const reset = vi.fn()
    const error = Object.assign(new Error('segredo interno do servidor'), {
      digest: '2861054973'
    })
    const user = userEvent.setup()
    renderWithIntl(<AppError error={error} reset={reset} />)

    const alert = screen.getByRole('alert')
    expect(
      within(alert).getByRole('heading', { level: 1, name: 'Esta página encontrou um erro' })
    ).toBeInTheDocument()
    expect(alert).toHaveTextContent(
      'Tente de novo. Se o erro continuar, recarregue a página ou volte ao início.'
    )
    expect(within(alert).getByText('ref. 2861054973')).toBeInTheDocument()
    const retry = within(alert).getByRole('button', { name: 'Tentar de novo' })
    expect(retry).toHaveFocus()
    expect(within(alert).getByRole('link', { name: 'Ir para o início' })).toHaveAttribute(
      'href',
      '/'
    )
    expect(document.body).not.toHaveTextContent('segredo interno')

    await user.click(retry)
    expect(reset).toHaveBeenCalledOnce()
  })

  it('sem digest, sem o chip de referência (EN)', () => {
    renderWithIntl(<AppError error={new Error('x')} reset={() => undefined} />, {
      locale: 'en'
    })

    expect(screen.getByRole('heading', { name: 'This page hit an error' })).toBeInTheDocument()
    expect(screen.queryByText(/ref\./)).not.toBeInTheDocument()
  })
})

describe('404 de rota na casca', () => {
  it('conteúdo com 404, h1, o caminho em mono e "Ir para o início"; nenhum item ativo e a trilha com o título', async () => {
    route.pathname = '/rota-inexistente'
    renderWithIntl(
      <AppShell>
        <NotFoundState />
      </AppShell>
    )

    const main = screen.getByRole('main')
    expect(
      within(main).getByRole('heading', { level: 1, name: 'Página não encontrada' })
    ).toBeInTheDocument()
    expect(within(main).getByText('404')).toBeInTheDocument()
    expect(within(main).getByText('/rota-inexistente')).toHaveClass('font-mono')
    expect(within(main).getByRole('link', { name: 'Ir para o início' })).toHaveAttribute(
      'href',
      '/'
    )
    expect(within(main).queryByRole('alert')).not.toBeInTheDocument()

    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(
      within(nav)
        .getAllByRole('link')
        .filter((link) => link.hasAttribute('aria-current'))
    ).toEqual([])
    const trail = screen.getByRole('navigation', { name: 'Você está em' })
    expect(await within(trail).findByText('Página não encontrada')).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  it('sub-rota sem página (/agents/x/y): "Agentes" não fica ativo nem aparece na trilha', async () => {
    route.pathname = '/agents/x/y'
    renderWithIntl(
      <AppShell>
        <NotFoundState />
      </AppShell>
    )

    const trail = screen.getByRole('navigation', { name: 'Você está em' })
    expect(await within(trail).findByText('Página não encontrada')).toBeInTheDocument()
    expect(within(trail).queryByText('Agentes')).not.toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(within(nav).getByRole('link', { name: 'Agentes' })).not.toHaveAttribute(
      'aria-current'
    )
  })
})
