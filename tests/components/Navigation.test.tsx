import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppShell, usePageLabel } from '@/components/layout/AppShell'
import { Navigation } from '@/components/layout/Navigation'

import { renderWithIntl } from '../helpers/intl'

// Sem o App Router no jsdom: o pathname vem do mock (next/navigation 15.2).
const route = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }))

// matchMedia controlável: o Sheet fecha quando a janela chega a 1024 px.
type Listener = (event: { matches: boolean }) => void
const desktopQuery = {
  matches: false,
  listeners: new Set<Listener>(),
  set(matches: boolean) {
    this.matches = matches
    this.listeners.forEach((listener) => listener({ matches }))
  }
}

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      media: query,
      get matches() {
        return desktopQuery.matches
      },
      addEventListener: (_type: string, listener: Listener) =>
        desktopQuery.listeners.add(listener),
      removeEventListener: (_type: string, listener: Listener) =>
        desktopQuery.listeners.delete(listener)
    }) as unknown as MediaQueryList
})

beforeEach(() => {
  desktopQuery.matches = false
  desktopQuery.listeners.clear()
})

const mainNav = () =>
  screen.getByRole('navigation', { name: 'Navegação principal' })

function activeLinks(container: HTMLElement) {
  return within(container)
    .getAllByRole('link')
    .filter((link) => link.hasAttribute('aria-current'))
}

describe('Navigation: item ativo', () => {
  it('em / só Início fica ativo, por igualdade exata', () => {
    route.pathname = '/'
    renderWithIntl(<Navigation />)

    const active = activeLinks(mainNav())
    expect(active).toHaveLength(1)
    expect(active[0]).toHaveAccessibleName('Início')
    expect(active[0]).toHaveAttribute('aria-current', 'page')
  })

  it('na rota da lista o item recebe aria-current="page"', () => {
    route.pathname = '/agents'
    renderWithIntl(<Navigation />)

    const active = activeLinks(mainNav())
    expect(active).toHaveLength(1)
    expect(active[0]).toHaveAccessibleName('Agentes')
    expect(active[0]).toHaveAttribute('aria-current', 'page')
  })

  it.each(['/agents/agente-alfa', '/agents/new'])(
    'na sub-rota %s "Agentes" fica ativo com aria-current="true"',
    (pathname) => {
      route.pathname = pathname
      renderWithIntl(<Navigation />)

      const active = activeLinks(mainNav())
      expect(active).toHaveLength(1)
      expect(active[0]).toHaveAccessibleName('Agentes')
      expect(active[0]).toHaveAttribute('aria-current', 'true')
    }
  )

  it('os itens são links reais para as rotas, nos grupos da navegação', () => {
    route.pathname = '/'
    renderWithIntl(<Navigation />)

    const hrefs = within(mainNav())
      .getAllByRole('link')
      .map((link) => [link.textContent, link.getAttribute('href')])
    expect(hrefs).toEqual([
      ['Início', '/'],
      ['Playground', '/playground'],
      ['Agentes', '/agents'],
      ['Tools', '/tools'],
      ['Dashboard', '/dashboard']
    ])
    for (const group of ['Testar', 'Configurar', 'Observar'])
      expect(within(mainNav()).getByText(group)).toBeInTheDocument()
  })
})

function LabeledPage({ label }: { label?: string }) {
  usePageLabel(label)
  return <h1>Editar Agente</h1>
}

describe('AppShell', () => {
  it('o 1º Tab mostra "Pular para o conteúdo" e o 2º vai ao 1º item da navegação', async () => {
    route.pathname = '/agents'
    const user = userEvent.setup()
    renderWithIntl(
      <AppShell>
        <h1>Agentes</h1>
      </AppShell>
    )

    await user.tab()
    const skip = screen.getByRole('link', { name: 'Pular para o conteúdo' })
    expect(skip).toHaveFocus()
    expect(skip).toHaveAttribute('href', '#conteudo')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'conteudo')

    await user.tab()
    expect(within(mainNav()).getByRole('link', { name: 'Início' })).toHaveFocus()
  })

  it('a trilha de um detalhe mostra o grupo, o link da lista e o id até o nome chegar', () => {
    route.pathname = '/agents/agente%20alfa'
    const { rerender } = renderWithIntl(
      <AppShell>
        <LabeledPage />
      </AppShell>
    )

    const trail = screen.getByRole('navigation', { name: 'Você está em' })
    expect(within(trail).getByText('Configurar')).toBeInTheDocument()
    expect(within(trail).getByRole('link', { name: 'Agentes' })).toHaveAttribute(
      'href',
      '/agents'
    )
    expect(within(trail).getByText('agente alfa')).toHaveAttribute(
      'aria-current',
      'page'
    )

    rerender(
      <AppShell>
        <LabeledPage label="Agente Alfa" />
      </AppShell>
    )
    const current = within(trail).getByText('Agente Alfa')
    expect(current).toHaveAttribute('aria-current', 'page')
    expect(current).toHaveAttribute('title', 'Agente Alfa')
  })

  it('em EN a casca vem do catálogo EN: trilha, navegação, subtítulo e seletores', () => {
    route.pathname = '/agents/new'
    renderWithIntl(
      <AppShell>
        <h1>New agent</h1>
      </AppShell>,
      { locale: 'en' }
    )

    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(nav).getByRole('link', { name: 'Agents' })).toHaveAttribute(
      'aria-current',
      'true'
    )
    const trail = screen.getByRole('navigation', { name: 'You are here' })
    expect(within(trail).getByText('Configure')).toBeInTheDocument()
    expect(within(trail).getByText('New agent')).toHaveAttribute('aria-current', 'page')
    // Subtítulo mono do celular: a seção em minúsculas.
    expect(screen.getByText('agents')).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: 'Language: English. Change language' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument()
  })

  it('o menu abre um Sheet que começa no 1º item; Esc fecha e devolve o foco', async () => {
    route.pathname = '/tools'
    const user = userEvent.setup()
    renderWithIntl(
      <AppShell>
        <h1>Tools</h1>
      </AppShell>
    )

    const menuButton = screen.getByRole('button', { name: 'Abrir menu' })
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    await user.click(menuButton)

    const sheet = screen.getByRole('dialog', { name: 'Menu' })
    expect(menuButton).toHaveAttribute('aria-expanded', 'true')
    expect(menuButton).toHaveAttribute('aria-controls', sheet.id)
    expect(within(sheet).getByRole('link', { name: 'Início' })).toHaveFocus()
    expect(
      within(sheet).getByRole('link', { name: 'Tools' })
    ).toHaveAttribute('aria-current', 'page')
    expect(
      within(sheet).getByRole('combobox', { name: 'Tema' })
    ).toBeInTheDocument()
    expect(
      within(sheet).getByRole('combobox', { name: 'Idioma' })
    ).toHaveTextContent('Português (Brasil)')

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument()
    expect(menuButton).toHaveFocus()
  })

  // P2-01 (V-P2-01-10): "Sair" é o último bloco da coluna da navegação e, no
  // Sheet, vem depois de Tema e Idioma.
  it('"Sair" fica depois da navegação lateral e no fim do Sheet', async () => {
    route.pathname = '/agents'
    const user = userEvent.setup()
    renderWithIntl(<AppShell>conteúdo</AppShell>)

    const signOut = screen.getByRole('button', { name: 'Sair' })
    expect(mainNav().compareDocumentPosition(signOut)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(mainNav()).not.toContainElement(signOut)

    await user.click(screen.getByRole('button', { name: 'Abrir menu' }))
    const sheet = screen.getByRole('dialog', { name: 'Menu' })
    const sheetSignOut = within(sheet).getByRole('button', { name: 'Sair' })
    expect(
      within(sheet).getByRole('combobox', { name: 'Idioma' }).compareDocumentPosition(sheetSignOut)
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('"Fechar menu" fecha o Sheet', async () => {
    route.pathname = '/'
    const user = userEvent.setup()
    renderWithIntl(<AppShell>conteúdo</AppShell>)

    await user.click(screen.getByRole('button', { name: 'Abrir menu' }))
    await user.click(screen.getByRole('button', { name: 'Fechar menu' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('o Sheet fecha quando a janela passa de 1024 px', async () => {
    route.pathname = '/'
    const user = userEvent.setup()
    renderWithIntl(<AppShell>conteúdo</AppShell>)

    await user.click(screen.getByRole('button', { name: 'Abrir menu' }))
    expect(screen.getByRole('dialog', { name: 'Menu' })).toBeInTheDocument()

    act(() => desktopQuery.set(true))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
