import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'next-themes'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { ThemeSelect } from '@/components/layout/ThemeSelect'

// prefers-color-scheme controlável: o next-themes lê `matches` e assina com
// addListener (next-themes 0.4.4, dist/index.mjs).
type Listener = (event: { matches: boolean }) => void
const systemScheme = {
  dark: false,
  listeners: new Set<Listener>(),
  set(dark: boolean) {
    this.dark = dark
    this.listeners.forEach((listener) => listener({ matches: dark }))
  }
}

beforeAll(() => {
  // O jsdom não implementa estas APIs, que o Select do Radix usa ao abrir.
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.releasePointerCapture = () => undefined
  Element.prototype.scrollIntoView = () => undefined
  window.matchMedia = (query: string) =>
    ({
      media: query,
      get matches() {
        return systemScheme.dark
      },
      addListener: (listener: Listener) => systemScheme.listeners.add(listener),
      removeListener: (listener: Listener) =>
        systemScheme.listeners.delete(listener)
    }) as unknown as MediaQueryList
})

beforeEach(() => {
  systemScheme.dark = false
  systemScheme.listeners.clear()
})

afterEach(() => {
  localStorage.clear()
  document.documentElement.className = ''
  document.documentElement.removeAttribute('style')
})

// Mesma configuração do src/app/layout.tsx.
function renderThemeSelect(variant?: 'icon') {
  render(
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ThemeSelect variant={variant} />
    </ThemeProvider>
  )
}

async function chooseTheme(name: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: 'Tema' }))
  await user.click(await screen.findByRole('option', { name }))
}

const html = document.documentElement

describe('ThemeSelect', () => {
  it('começa em Sistema, com o rótulo Tema', async () => {
    renderThemeSelect()

    const select = screen.getByRole('combobox', { name: 'Tema' })
    expect(select).toBeEnabled()
    expect(select).toHaveTextContent('Sistema')
  })

  it('Escuro põe a classe dark no <html> e grava theme no localStorage', async () => {
    renderThemeSelect()

    await chooseTheme('Escuro')

    expect(html).toHaveClass('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(screen.getByRole('combobox', { name: 'Tema' })).toHaveTextContent(
      'Escuro'
    )
  })

  it('Claro tira a classe dark do <html>', async () => {
    renderThemeSelect()
    await chooseTheme('Escuro')

    await chooseTheme('Claro')

    expect(html).not.toHaveClass('dark')
    expect(html).toHaveClass('light')
    expect(localStorage.getItem('theme')).toBe('light')
  })

  it('Sistema segue o prefers-color-scheme, inclusive quando ele muda', async () => {
    systemScheme.dark = true
    renderThemeSelect()
    await chooseTheme('Claro')

    await chooseTheme('Sistema')

    expect(localStorage.getItem('theme')).toBe('system')
    expect(html).toHaveClass('dark')

    act(() => systemScheme.set(false))
    expect(html).not.toHaveClass('dark')
  })

  it('volta com o tema gravado no localStorage', () => {
    localStorage.setItem('theme', 'dark')
    renderThemeSelect()

    expect(screen.getByRole('combobox', { name: 'Tema' })).toHaveTextContent(
      'Escuro'
    )
    expect(html).toHaveClass('dark')
  })

  it('variante do cabeçalho: botão só com ícone, nome com o tema atual', async () => {
    renderThemeSelect('icon')

    const button = screen.getByRole('combobox', {
      name: 'Tema: Sistema. Alterar tema'
    })
    expect(button).toHaveTextContent('')

    const user = userEvent.setup()
    await user.click(button)
    await user.click(await screen.findByRole('option', { name: 'Escuro' }))

    expect(html).toHaveClass('dark')
    expect(
      screen.getByRole('combobox', { name: 'Tema: Escuro. Alterar tema' })
    ).toBeInTheDocument()
  })
})
