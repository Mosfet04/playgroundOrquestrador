import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Toaster } from 'sonner'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ToolForm } from '@/components/management/tools/ToolForm'
import type { Tool } from '@/types/management'

import { renderWithIntl } from '../helpers/intl'
import { saveAndConfirm, touchName } from '../helpers/saveReview'
import { captureSave, paste, saveButton, stubBrowserApis, tool } from '../helpers/toolForm'
import { server } from '../msw/server'

// QA1-07 (#10): header em Segredo, a troca automática para Segredo no nome
// sensível (D-QA1-07-2), o erro de valor só depois de tocar ou salvar e o 422
// `headers` no grupo, com o motivo no toast (D-QA1-07-1).
// Spec: docs/design/QA1-07.md.

beforeAll(stubBrowserApis)

type User = ReturnType<typeof userEvent.setup>

async function renderReady(value?: Tool) {
  const user = userEvent.setup()
  renderWithIntl(
    <>
      <ToolForm tool={value} onSuccess={() => {}} />
      <Toaster />
    </>
  )
  await waitFor(() => expect(saveButton()).toBeEnabled())
  return user
}

const group = () => screen.getByRole('group', { name: 'Headers HTTP' })
const lastRow = () => within(group()).getAllByRole('listitem').at(-1) as HTMLElement
const mode = (row: HTMLElement) => within(row).getByRole('combobox', { name: /^Modo do valor de/ })
const nameInput = (row: HTMLElement) => within(row).getAllByRole('textbox')[0]
const envTarget = (row: HTMLElement) => within(row).getByRole('textbox', { name: /^Variável de ambiente/ })
const notice = (name: string) => `${name} é sensível: o modo mudou para Segredo.`

async function chooseMode(user: User, row: HTMLElement, label: 'Texto' | 'Segredo') {
  await user.click(mode(row))
  await user.click(screen.getByRole('option', { name: label }))
}

async function addRow(user: User) {
  await user.click(screen.getByRole('button', { name: 'Adicionar header' }))
  return lastRow()
}

async function fillNewTool(user: User) {
  await user.type(screen.getByLabelText(/ID da tool/), 'qa-token')
  await user.type(screen.getByLabelText(/^Nome \*/, { selector: '#name' }), 'QA token')
  await user.type(screen.getByLabelText(/^Descrição/), 'Header com segredo')
  await paste(user, screen.getByLabelText(/^Rota/), 'https://api.exemplo.com/anything')
}

describe('corpo enviado (cenário do relatório)', () => {
  it('Authorization em Segredo env:QA_TOKEN_API_KEY sai como a referência, sem espaço nem prefixo a mais', async () => {
    const bodies = captureSave('post')
    const user = await renderReady()
    await fillNewTool(user)
    const row = await addRow(user)
    await chooseMode(user, row, 'Segredo')
    await user.type(envTarget(row), 'QA_TOKEN_API_KEY')
    await user.type(nameInput(row), 'Authorization')

    await user.click(saveButton())

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].route).toBe('https://api.exemplo.com/anything')
    expect(bodies[0].headers).toEqual({ Authorization: 'env:QA_TOKEN_API_KEY' })
  })
})

describe('troca automática para Segredo (D-QA1-07-2)', () => {
  it.each(['Authorization', 'x-api-key', 'Cookie', 'proxy-authorization', 'foo-token'])(
    '%s numa linha nova em Texto: vira Segredo com o aviso, o foco fica no nome',
    async (name) => {
      const user = await renderReady(tool)
      const row = await addRow(user)

      await user.type(nameInput(row), name)

      expect(mode(row)).toHaveTextContent('Segredo')
      expect(envTarget(row)).toHaveValue('')
      expect(nameInput(row)).toHaveFocus()
      expect(within(row).getByText(notice(name))).toBeVisible()
      // Nenhum erro antes de tocar ou salvar.
      expect(envTarget(row)).not.toBeInvalid()
      expect(within(row).queryByText('Informe o alvo da referência')).toBeNull()
    }
  )

  it.each(['X-Secret', 'content-type', 'X-Trace-Id'])('%s não troca', async (name) => {
    const user = await renderReady(tool)
    const row = await addRow(user)

    await user.type(nameInput(row), name)

    expect(mode(row)).toHaveTextContent('Texto')
    expect(within(row).queryByText(/o modo mudou para Segredo/)).toBeNull()
  })

  it('com valor em Texto já digitado não troca: fica o erro de nome sensível', async () => {
    const user = await renderReady(tool)
    const row = await addRow(user)
    await paste(user, within(row).getAllByRole('textbox')[1], 'Bearer abc')

    await user.type(nameInput(row), 'Authorization')

    expect(mode(row)).toHaveTextContent('Texto')
    expect(within(row).getByRole('textbox', { name: 'Valor de Authorization' })).toHaveValue('Bearer abc')
    await user.click(saveButton())
    expect(await within(row).findByText(/Authorization é sensível: use Segredo/)).toBeVisible()
  })

  it('o aviso descreve o alvo e some ao voltar a Texto; a troca não se repete', async () => {
    const user = await renderReady(tool)
    const row = await addRow(user)
    await user.type(nameInput(row), 'Authorization')
    expect(envTarget(row)).toHaveAccessibleDescription(expect.stringContaining(notice('Authorization')))

    await chooseMode(user, row, 'Texto')

    expect(within(row).queryByText(notice('Authorization'))).toBeNull()
    await user.clear(nameInput(row))
    await user.type(nameInput(row), 'Authorization')
    expect(mode(row)).toHaveTextContent('Texto')
    expect(within(row).queryByText(/o modo mudou para Segredo/)).toBeNull()
  })

  it('o aviso fica enquanto o nome é sensível e a linha está em Segredo', async () => {
    const user = await renderReady(tool)
    const row = await addRow(user)
    await user.type(nameInput(row), 'X-Api-Key')
    await user.type(envTarget(row), 'LOJA_API_KEY')
    expect(within(row).getByText(notice('X-Api-Key'))).toBeVisible()

    await user.type(nameInput(row), 's')

    expect(within(row).queryByText(/o modo mudou para Segredo/)).toBeNull()
    expect(mode(row)).toHaveTextContent('Segredo')
  })
})

describe('erro de valor só depois de tocar ou salvar', () => {
  it('"Usar segredo" depois do Salvar: alvo focado, sem erro; o erro vem ao sair do alvo vazio', async () => {
    const user = await renderReady(tool)
    const row = await addRow(user)
    await paste(user, within(row).getAllByRole('textbox')[1], 'Bearer abc')
    await user.type(nameInput(row), 'Authorization')
    await user.click(saveButton())
    await within(row).findByText(/é sensível/)

    await user.click(within(row).getByRole('button', { name: 'Usar segredo em Authorization' }))

    const target = envTarget(row)
    await waitFor(() => expect(target).toHaveFocus())
    expect(target).not.toBeInvalid()
    expect(within(row).queryByText('Informe o alvo da referência')).toBeNull()
    expect(within(row).queryByText(/é sensível/)).toBeNull()

    await user.tab()

    expect(await within(row).findByText('Informe o alvo da referência')).toBeVisible()
    expect(target).toBeInvalid()
  })

  it('troca automática depois de um Salvar não mostra o erro do alvo até salvar de novo', async () => {
    const bodies = captureSave()
    const user = await renderReady(tool)
    const row = await addRow(user)
    await user.click(saveButton())
    await within(row).findByText('Informe o nome · Informe o valor')

    await user.type(nameInput(row), 'Authorization')

    expect(mode(row)).toHaveTextContent('Segredo')
    expect(within(row).queryByText(/Informe/)).toBeNull()
    await user.click(saveButton())
    expect(await within(row).findByText('Informe o alvo da referência')).toBeVisible()
    expect(bodies).toEqual([])
  })

  it('"Informe o valor" só ao sair do valor vazio', async () => {
    const user = await renderReady(tool)
    const row = await addRow(user)
    await user.type(nameInput(row), 'X-Conta')
    const value = within(row).getByRole('textbox', { name: 'Valor de X-Conta' })
    expect(within(row).queryByText('Informe o valor')).toBeNull()

    await user.click(value)
    await user.tab()

    expect(await within(row).findByText('Informe o valor')).toBeVisible()
    expect(value).toBeInvalid()
  })
})

describe('422 em headers (D-QA1-07-1)', () => {
  const refuse = (field: string) =>
    server.use(
      http.put('*/api/tools/:id', () =>
        HttpResponse.json({ success: false, error: 'invalid_config', field }, { status: 422 })
      )
    )
  const stored: Tool = { ...tool, headers: { Authorization: 'env:QA_TOKEN_API_KEY' } }

  it('erro no grupo com o motivo, rolagem até ele e toast com o motivo e o código', async () => {
    refuse('headers')
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
    const user = await renderReady(stored)

    await touchName(user)
    await saveAndConfirm(user)

    const rejected =
      'O orquestrador recusou um header e não diz qual. Confira nomes e valores. Segredo só vale para host confiável do orquestrador.'
    expect(await within(group()).findByText(rejected)).toBeVisible()
    expect(screen.getByRole('list', { name: 'Headers HTTP' })).toHaveAccessibleDescription(rejected)
    expect(await screen.findByText('Não foi possível salvar a tool')).toBeVisible()
    expect(
      screen.getByText(
        'Um header foi recusado e o orquestrador não diz qual. Se usa segredo, a rota precisa ser de host confiável. Veja a seção Headers. (código 422)'
      )
    ).toBeVisible()
    await waitFor(() => expect(envTarget(lastRow())).toHaveFocus())
    expect(scroll.mock.contexts).toContain(document.getElementById('headers-error'))
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' })
    // Não se sabe qual header: nenhuma linha fica inválida.
    expect(envTarget(lastRow())).not.toBeInvalid()
    scroll.mockRestore()
  })

  it('o erro do grupo sai ao editar um header', async () => {
    refuse('headers')
    const user = await renderReady(stored)
    await touchName(user)
    await saveAndConfirm(user)
    await within(group()).findByText(/O orquestrador recusou um header/)

    await user.type(envTarget(lastRow()), 'X')

    expect(within(group()).queryByText(/O orquestrador recusou um header/)).toBeNull()
    expect(screen.getByRole('list', { name: 'Headers HTTP' })).not.toHaveAttribute('aria-describedby')
  })

  it('422 em outro campo mantém o toast de sempre', async () => {
    refuse('route')
    const user = await renderReady(stored)

    await touchName(user)
    await saveAndConfirm(user)

    expect(await screen.findByText('Não foi possível salvar a tool (código 422)')).toBeVisible()
    expect(screen.queryByText(/Veja a seção Headers/)).toBeNull()
  })
})

describe('textos', () => {
  it('a ajuda do grupo diz que o segredo só vale para host confiável', async () => {
    await renderReady(tool)

    expect(screen.getByText(/Segredo só vale para rota em host confiável do orquestrador\./)).toBeVisible()
  })

  it('placeholders do alvo curtos (env: e file:)', async () => {
    const user = await renderReady(tool)
    const row = await addRow(user)
    await chooseMode(user, row, 'Segredo')
    expect(envTarget(row)).toHaveAttribute('placeholder', 'OPENAI_API_KEY')

    await user.click(within(row).getByRole('combobox', { name: /^Formato/ }))
    await user.click(screen.getByRole('option', { name: 'file:' }))

    expect(within(row).getByRole('textbox', { name: /^Caminho do arquivo/ })).toHaveAttribute(
      'placeholder',
      '/secrets/key'
    )
  })
})
