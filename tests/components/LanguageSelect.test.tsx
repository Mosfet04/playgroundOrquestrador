import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { LanguageSelect } from '@/components/layout/LanguageSelect'

import { renderWithIntl } from '../helpers/intl'

// A server action grava o cookie e devolve a rota re-renderizada no servidor
// (D-P1-04-5); aqui só a chamada importa.
const actions = vi.hoisted(() => ({ setLocale: async (locale: string) => locale }))
vi.mock('@/i18n/actions', () => actions)

beforeAll(() => {
  // O jsdom não implementa estas APIs, que o Select do Radix usa ao abrir.
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.releasePointerCapture = () => undefined
  Element.prototype.scrollIntoView = () => undefined
})

describe('LanguageSelect', () => {
  it('cabeçalho: botão com o código do idioma e o nome no aria-label', () => {
    renderWithIntl(<LanguageSelect variant="icon" />)

    const trigger = screen.getByRole('combobox', {
      name: 'Idioma: Português (Brasil). Alterar idioma'
    })
    expect(trigger).toHaveTextContent('PT')
    expect(trigger).toBeEnabled()
  })

  it('em EN o aria-label vem do catálogo EN e o código é EN', () => {
    renderWithIntl(<LanguageSelect variant="icon" />, { locale: 'en' })

    expect(
      screen.getByRole('combobox', { name: 'Language: English. Change language' })
    ).toHaveTextContent('EN')
  })

  it('opções no próprio idioma, nesta ordem, com lang e o atual marcado', async () => {
    const user = userEvent.setup()
    renderWithIntl(<LanguageSelect variant="icon" />, { locale: 'en' })

    await user.click(screen.getByRole('combobox'))
    const options = within(await screen.findByRole('listbox')).getAllByRole('option')

    expect(options.map((option) => option.textContent)).toEqual([
      'Português (Brasil)',
      'English'
    ])
    expect(options.map((option) => option.getAttribute('lang'))).toEqual(['pt-BR', 'en'])
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
  })

  it('escolher outro idioma chama a server action com o idioma', async () => {
    const setLocale = vi.spyOn(actions, 'setLocale')
    const user = userEvent.setup()
    renderWithIntl(<LanguageSelect variant="icon" />)

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'English' }))

    expect(setLocale).toHaveBeenCalledTimes(1)
    expect(setLocale).toHaveBeenCalledWith('en')
  })

  it('escolher o idioma atual não faz nada', async () => {
    const setLocale = vi.spyOn(actions, 'setLocale')
    const user = userEvent.setup()
    renderWithIntl(<LanguageSelect variant="icon" />)

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'Português (Brasil)' }))

    expect(setLocale).not.toHaveBeenCalled()
  })

  it('menu do celular: rótulo "Idioma" e o nome do idioma atual no trigger', () => {
    renderWithIntl(<LanguageSelect />)

    expect(screen.getByRole('combobox', { name: 'Idioma' })).toHaveTextContent(
      'Português (Brasil)'
    )
  })
})

// QA P1-04: o estado ocupado (aria-busy) depende de transition assíncrona,
// que só o React 19 do App Router rastreia; o React 18 do Vitest não. Ele é
// coberto no E2E (e2e/i18n.qa.spec.ts). Aqui, o teclado.
describe('LanguageSelect: teclado', () => {
  it('teclado: Enter abre, seta + Enter escolhe, Esc fecha sem trocar', async () => {
    const setLocale = vi.spyOn(actions, 'setLocale')
    const user = userEvent.setup()
    renderWithIntl(<LanguageSelect variant="icon" />)
    const trigger = screen.getByRole('combobox')

    await user.tab()
    expect(trigger).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('listbox')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(setLocale).not.toHaveBeenCalled()

    await user.keyboard('{Enter}')
    await screen.findByRole('listbox')
    await user.keyboard('{ArrowDown}{Enter}')
    expect(setLocale).toHaveBeenCalledWith('en')
  })
})
