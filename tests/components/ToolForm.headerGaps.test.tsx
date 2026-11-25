import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, describe, expect, it } from 'vitest'

import { ToolForm } from '@/components/management/tools/ToolForm'
import type { Tool } from '@/types/management'

import { renderWithIntl } from '../helpers/intl'
import { saveAndConfirm, touchName } from '../helpers/saveReview'
import { saveButton, stubBrowserApis, tool } from '../helpers/toolForm'
import { SCHEMA_URL } from '../msw/handlers'
import { server } from '../msw/server'

// QA1-07, lacunas do QA (R3 da revisão): a troca automática para Segredo
// (D-QA1-07-2) não vale para linha só leitura/`locked` nem para linha oculta
// (`***`); e a limpeza do erro de 422 `headers` por mudança de modo e remoção.

beforeAll(stubBrowserApis)

const group = () => screen.getByRole('group', { name: 'Headers HTTP' })
const lastRow = () => within(group()).getAllByRole('listitem').at(-1) as HTMLElement
const rowNamed = (name: string) =>
  within(group())
    .getAllByRole('listitem')
    .find((row) => (within(row).getAllByRole('textbox')[0] as HTMLInputElement).value === name) as HTMLElement
const mode = (row: HTMLElement) => within(row).getByRole('combobox', { name: /^Modo do valor de/ })
const nameInput = (row: HTMLElement) => within(row).getAllByRole('textbox')[0]
const AUTO = /o modo mudou para Segredo/

async function render(value: Tool) {
  const user = userEvent.setup()
  renderWithIntl(<ToolForm tool={value} onSuccess={() => {}} />)
  await screen.findByRole('group', { name: 'Headers HTTP' })
  return user
}

describe('troca automática: linhas que ficam fora da regra', () => {
  // Só leitura (`writable:false`) desabilita "Adicionar header" e os campos: não há
  // como digitar o nome; o caso alcançável é o schema indisponível.
  it('schema indisponível: Authorization numa linha nova segue em Texto, sem aviso', async () => {
    server.use(http.get(SCHEMA_URL, () => HttpResponse.json({ success: false }, { status: 503 })))
    const user = await render(tool)
    // Espera o estado travado assentar (o Select do método fica desabilitado).
    await waitFor(() => expect(screen.getByRole('combobox', { name: /^Método HTTP/ })).toBeDisabled())
    await user.click(screen.getByRole('button', { name: 'Adicionar header' }))
    const row = lastRow()

    await user.type(nameInput(row), 'Authorization')

    expect(mode(row)).toHaveTextContent('Texto')
    expect(mode(row)).toBeDisabled()
    expect(within(row).queryByText(AUTO)).toBeNull()
    expect(within(row).queryByRole('combobox', { name: /^Formato/ })).toBeNull()
  })

  it('linha oculta (***): mudar o nome para um sensível não troca o modo nem apaga o valor', async () => {
    const user = await render({ ...tool, headers: { 'X-Trace': '***' } })
    await waitFor(() => expect(saveButton()).toBeEnabled())
    const row = rowNamed('X-Trace')

    await user.clear(nameInput(row))
    await user.type(nameInput(row), 'Authorization')

    expect(mode(row)).toHaveTextContent('Texto')
    expect(within(row).queryByText(AUTO)).toBeNull()
    expect(within(row).getByLabelText('Valor de Authorization (gravado, oculto)')).toHaveValue('***')
  })
})

describe('422 headers: limpeza do erro do grupo', () => {
  const REJECTED = /O orquestrador recusou um header/
  const refuse = () =>
    server.use(
      http.put('*/api/tools/:id', () =>
        HttpResponse.json({ success: false, error: 'invalid_config', field: 'headers' }, { status: 422 })
      )
    )
  const stored: Tool = { ...tool, headers: { Authorization: 'env:QA_TOKEN_API_KEY', Accept: 'text/plain' } }

  async function rejected() {
    refuse()
    const user = await render(stored)
    await waitFor(() => expect(saveButton()).toBeEnabled())
    await touchName(user)
    await saveAndConfirm(user)
    await within(group()).findByText(REJECTED)
    return user
  }

  it('trocar o modo de uma linha (setValue) limpa o erro', async () => {
    const user = await rejected()
    const row = rowNamed('Accept')

    await user.click(mode(row))
    await user.click(screen.getByRole('option', { name: 'Segredo' }))

    expect(within(group()).queryByText(REJECTED)).toBeNull()
  })

  it('remover uma linha limpa o erro', async () => {
    const user = await rejected()

    await user.click(screen.getByRole('button', { name: 'Remover Accept' }))

    expect(within(group()).queryByText(REJECTED)).toBeNull()
  })

  it('sem nenhuma linha: o erro aparece no grupo e o foco vai a "Adicionar header"', async () => {
    refuse()
    const user = await render({ ...tool, headers: {} })
    await waitFor(() => expect(saveButton()).toBeEnabled())
    await touchName(user)
    await saveAndConfirm(user)

    expect(await within(group()).findByText(REJECTED)).toBeVisible()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Adicionar header' })).toHaveFocus())
  })
})
