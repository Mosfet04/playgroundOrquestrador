import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { GettingStarted } from '@/components/management/GettingStarted'

import { renderWithIntl } from '../helpers/intl'

// QA1-11 (#27, V10/V11): marcar o passo como feito não desmonta os botões e
// "Desfazer" volta o passo a pendente, com o foco no mesmo botão.

const card = (title: string) =>
  screen.getByRole('group', { name: new RegExp(`${title}$`) })

describe('Início: passos', () => {
  it('marcar como feito troca o botão por "Desfazer" e mantém o link do passo', async () => {
    const user = userEvent.setup()
    renderWithIntl(<GettingStarted />)
    const first = card('Crie seu primeiro agente')

    await user.click(
      within(first).getByRole('button', { name: 'Marcar como feito' })
    )

    expect(
      within(first).getByRole('link', { name: 'Criar agente' })
    ).toHaveAttribute('href', '/agents/new')
    expect(
      within(first).getByRole('button', { name: 'Desfazer' })
    ).toBeInTheDocument()
    expect(
      within(first).queryByRole('button', { name: 'Marcar como feito' })
    ).toBeNull()
    expect(screen.getByText('1 de 3 concluídos')).toBeInTheDocument()
  })

  it('"Desfazer" volta o passo a pendente e o foco fica no botão', async () => {
    const user = userEvent.setup()
    renderWithIntl(<GettingStarted />)
    const first = card('Crie seu primeiro agente')

    await user.click(
      within(first).getByRole('button', { name: 'Marcar como feito' })
    )
    expect(
      within(first).getByRole('button', { name: 'Desfazer' })
    ).toHaveFocus()
    await user.click(within(first).getByRole('button', { name: 'Desfazer' }))

    expect(
      within(first).getByRole('button', { name: 'Marcar como feito' })
    ).toHaveFocus()
    expect(first).not.toHaveClass('border-success')
    expect(screen.getByText('0 de 3 concluídos')).toBeInTheDocument()
  })

  it('anuncia o estado do passo por região aria-live', async () => {
    const user = userEvent.setup()
    renderWithIntl(<GettingStarted />)
    const first = card('Crie seu primeiro agente')
    const status = within(first).getByRole('status')

    expect(status).toHaveTextContent('Passo 1: pendente')
    await user.click(
      within(first).getByRole('button', { name: 'Marcar como feito' })
    )
    expect(status).toHaveTextContent('Passo 1: concluído')
  })
})
