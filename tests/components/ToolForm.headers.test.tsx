import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Toaster } from 'sonner'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ToolForm } from '@/components/management/tools/ToolForm'
import type { Tool } from '@/types/management'

import { server } from '../msw/server'
import { renderWithIntl } from '../helpers/intl'
import { captureSave, paste, saveButton, stubBrowserApis, tool } from '../helpers/toolForm'

// P3-03 (D-P3-03-3): headers em linhas nome + valor. Referência `env:`/`file:`
// como está; `***` é o valor gravado, oculto e mantido; nome sensível com
// texto novo é recusado no cliente, sem request.

beforeAll(stubBrowserApis)

const SECRET = 'Bearer abc123-valor-em-texto'

const stored: Tool = {
  ...tool,
  headers: {
    Accept: 'application/json',
    'X-Api-Key': 'env:LOJA_API_KEY',
    Authorization: '***'
  }
}

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
const nameField = (n: number) => screen.getByLabelText(`Nome do header ${n}`)
const addHeader = () => screen.getByRole('button', { name: 'Adicionar header' })

async function addRow(user: ReturnType<typeof userEvent.setup>, name: string, value: string) {
  await user.click(addHeader())
  const rows = within(group()).getAllByRole('listitem')
  const row = rows[rows.length - 1]
  const [nameInput, valueInput] = within(row).getAllByRole('textbox')
  await user.type(nameInput, name)
  await paste(user, valueInput, value)
  return row
}

describe('estados do valor', () => {
  it('texto, referência e oculto: valor como está, chip do estado e "Substituir" só no oculto', async () => {
    await renderReady(stored)

    const [text, reference, hidden] = within(group()).getAllByRole('listitem')
    expect(within(text).getByLabelText('Valor de Accept')).toHaveValue('application/json')
    expect(within(text).getByText('texto')).toBeVisible()
    expect(within(reference).getByLabelText('Valor de X-Api-Key')).toHaveValue('env:LOJA_API_KEY')
    expect(within(reference).getByText('referência')).toBeVisible()
    const masked = within(hidden).getByLabelText('Valor de Authorization (gravado, oculto)')
    expect(masked).toHaveValue('***')
    expect(masked).toHaveAttribute('readonly')
    expect(within(hidden).getByText('oculto')).toBeVisible()
    expect(within(hidden).getByRole('button', { name: 'Substituir o valor de Authorization' })).toBeVisible()
    expect(within(text).queryByRole('button', { name: /Substituir/ })).toBeNull()
    expect(screen.getByText(/é o valor gravado, oculto/)).toHaveTextContent(
      '*** é o valor gravado, oculto. Ele é mantido até você substituir, e só se a origem da rota (https://api.loja.example) não mudar.'
    )
  })

  it('o chip descreve o valor (aria-describedby)', async () => {
    await renderReady(stored)

    expect(screen.getByLabelText('Valor de Accept')).toHaveAccessibleDescription('texto')
    expect(screen.getByLabelText('Valor de X-Api-Key')).toHaveAccessibleDescription('referência')
  })

  it('sem header: linha vazia com a mensagem', async () => {
    await renderReady(tool)

    expect(screen.getByText('Nenhum header configurado')).toBeVisible()
    expect(screen.queryByText(/é o valor gravado, oculto/)).toBeNull()
  })
})

describe('salvar', () => {
  it('"***" volta como veio; texto e referência vão como estão', async () => {
    const bodies = captureSave()
    const user = await renderReady(stored)

    await user.click(saveButton())

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].headers).toEqual({
      Accept: 'application/json',
      'X-Api-Key': 'env:LOJA_API_KEY',
      Authorization: '***'
    })
  })

  it('"Substituir" deixa o campo vazio, editável e focado; o valor novo vai no lugar', async () => {
    const bodies = captureSave()
    const user = await renderReady(stored)

    await user.click(screen.getByRole('button', { name: 'Substituir o valor de Authorization' }))

    const field = screen.getByLabelText('Novo valor de Authorization')
    expect(field).toHaveValue('')
    expect(field).not.toHaveAttribute('readonly')
    expect(field).toHaveFocus()
    expect(field).toHaveAttribute('placeholder', 'Novo valor ou env:, file:')
    expect(screen.getByRole('button', { name: 'Manter o valor oculto de Authorization' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /Substituir/ })).toBeNull()

    await user.type(field, 'env:NOVA_CHAVE')
    await user.click(saveButton())

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].headers).toMatchObject({ Authorization: 'env:NOVA_CHAVE' })
  })

  it('"Manter oculto" restaura "***" e devolve o foco a "Substituir"', async () => {
    const bodies = captureSave()
    const user = await renderReady(stored)
    await user.click(screen.getByRole('button', { name: 'Substituir o valor de Authorization' }))
    await user.type(screen.getByLabelText('Novo valor de Authorization'), 'env:X')

    await user.click(screen.getByRole('button', { name: 'Manter o valor oculto de Authorization' }))

    expect(screen.getByLabelText('Valor de Authorization (gravado, oculto)')).toHaveValue('***')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Substituir o valor de Authorization' })).toHaveFocus()
    )
    await user.click(saveButton())
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].headers).toMatchObject({ Authorization: '***' })
  })

  it('nome comum aceita texto novo; nome sensível aceita referência', async () => {
    const bodies = captureSave('post')
    const user = await renderReady()
    await user.type(screen.getByLabelText(/ID da tool/), 'clima')
    await user.type(screen.getByLabelText(/^Nome \*/, { selector: '#name' }), 'Clima')
    await user.type(screen.getByLabelText(/^Descrição/), 'Consulta o clima')
    await paste(user, screen.getByLabelText(/^Rota/), 'https://clima.example.com/v1')
    await addRow(user, 'X-Conta', 'valor em texto')
    await addRow(user, 'Authorization', 'file:/run/secrets/token')

    await user.click(saveButton())

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].headers).toEqual({
      'X-Conta': 'valor em texto',
      Authorization: 'file:/run/secrets/token'
    })
  })

  it('remover uma linha tira o header do documento', async () => {
    const bodies = captureSave()
    const user = await renderReady(stored)

    await user.click(screen.getByRole('button', { name: 'Remover Accept' }))
    await user.click(saveButton())

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].headers).toEqual({ 'X-Api-Key': 'env:LOJA_API_KEY', Authorization: '***' })
  })
})

describe('header sensível em texto (D-P3-03-3)', () => {
  it.each(['Authorization', 'Proxy-Authorization', 'Cookie', 'X-Api-Token', 'x_api_key'])(
    '%s com texto novo: nenhum request, erro na linha sem o valor, foco no valor',
    async (name) => {
      const bodies = captureSave()
      const requests: string[] = []
      server.events.on('request:start', ({ request }) => requests.push(`${request.method} ${request.url}`))
      const user = await renderReady(tool)
      const row = await addRow(user, name, SECRET)
      requests.length = 0

      await user.click(saveButton())

      const error = `${name} é sensível: use uma referência (env:, file:), nunca o valor.`
      expect(await within(row).findByText(error)).toBeVisible()
      expect(row.textContent).not.toContain(SECRET)
      expect(within(row).getAllByRole('textbox')[1]).toBeInvalid()
      expect(within(row).getAllByRole('textbox')[1]).toHaveFocus()
      expect(screen.getByText(error, { selector: 'p' })).not.toHaveTextContent(SECRET)
      expect(bodies).toEqual([])
      expect(requests.filter((request) => request.startsWith('PUT') || request.startsWith('POST'))).toEqual([])
      server.events.removeAllListeners()
    }
  )

  it('o erro sai ao trocar por uma referência e o envio segue', async () => {
    const bodies = captureSave()
    const user = await renderReady(tool)
    const row = await addRow(user, 'Authorization', SECRET)
    await user.click(saveButton())
    await within(row).findByText(/é sensível/)

    await paste(user, within(row).getAllByRole('textbox')[1], 'env:LOJA_TOKEN')
    expect(within(row).queryByText(/é sensível/)).toBeNull()
    await user.click(saveButton())

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].headers).toEqual({ Authorization: 'env:LOJA_TOKEN' })
  })

  it('nenhum valor de texto digitado vai para o console', async () => {
    const lines: unknown[][] = []
    const spies = (['log', 'warn', 'error', 'info'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation((...args) => void lines.push(args))
    )
    const user = await renderReady(tool)
    await addRow(user, 'Authorization', SECRET)
    await user.click(saveButton())
    await screen.findByText(/é sensível/)

    expect(JSON.stringify(lines)).not.toContain(SECRET)
    spies.forEach((spy) => spy.mockRestore())
  })
})

describe('outros erros de linha', () => {
  it('nome repetido (sem diferenciar maiúscula) é recusado na repetição', async () => {
    const bodies = captureSave()
    const user = await renderReady(tool)
    await addRow(user, 'Accept', 'a')
    const second = await addRow(user, 'accept', 'b')

    await user.click(saveButton())

    expect(await within(second).findByText('Já existe um header com este nome')).toBeVisible()
    expect(within(second).getByLabelText('Nome do header 2')).toBeInvalid()
    expect(bodies).toEqual([])
  })

  it('linha vazia: "Informe o nome · Informe o valor"', async () => {
    const bodies = captureSave()
    const user = await renderReady(tool)
    await user.click(addHeader())

    await user.click(saveButton())

    expect(await screen.findByText('Informe o nome · Informe o valor')).toBeVisible()
    expect(nameField(1)).toHaveFocus()
    expect(bodies).toEqual([])
  })
})

describe('origem da rota', () => {
  it('mudar a origem com linha oculta avisa citando o header', async () => {
    const user = await renderReady(stored)
    expect(screen.queryByText(/A origem da rota mudou/)).toBeNull()

    await paste(user, screen.getByLabelText(/^Rota/), 'https://outro.example/v1/orders/{order_id}')

    expect(screen.getByText(/A origem da rota mudou/)).toHaveTextContent(
      'A origem da rota mudou (https://api.loja.example → https://outro.example). O orquestrador só mantém valores ocultos na mesma origem: substitua Authorization.'
    )
  })

  it('mudar só o caminho não avisa; substituir a linha tira o aviso', async () => {
    const user = await renderReady(stored)
    await paste(user, screen.getByLabelText(/^Rota/), 'https://api.loja.example/v2/orders/{order_id}')
    expect(screen.queryByText(/A origem da rota mudou/)).toBeNull()

    await paste(user, screen.getByLabelText(/^Rota/), 'https://outro.example/v1/orders/{order_id}')
    expect(screen.getByText(/A origem da rota mudou/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Substituir o valor de Authorization' }))

    expect(screen.queryByText(/A origem da rota mudou/)).toBeNull()
  })
})

describe('422 em headers', () => {
  it('erro no grupo, foco no 1º valor, sem o valor na tela', async () => {
    server.use(
      http.put('*/api/tools/:id', () =>
        HttpResponse.json({ success: false, error: 'invalid_config', field: 'headers' }, { status: 422 })
      )
    )
    const user = await renderReady(stored)

    await user.click(saveButton())

    const message = await screen.findByText(/O orquestrador recusou algum header e não diz qual/)
    expect(within(group()).getByText(message.textContent ?? '')).toBe(message)
    expect(screen.getByRole('list', { name: 'Headers HTTP' })).toHaveAccessibleDescription(message.textContent ?? '')
    await waitFor(() => expect(screen.getByLabelText('Valor de Accept')).toHaveFocus())
  })
})

describe('422 em headers sem nenhuma linha', () => {
  it('o foco vai a "Adicionar header"', async () => {
    server.use(
      http.put('*/api/tools/:id', () =>
        HttpResponse.json({ success: false, error: 'invalid_config', field: 'headers' }, { status: 422 })
      )
    )
    const user = await renderReady(tool)

    await user.click(saveButton())

    expect(await screen.findByText(/O orquestrador recusou algum header e não diz qual/)).toBeVisible()
    await waitFor(() => expect(addHeader()).toHaveFocus())
  })
})

describe('remover linha', () => {
  it('foco no nome da seguinte, da anterior ou em "Adicionar header"', async () => {
    const user = await renderReady({ ...tool, headers: { A: '1', B: '2' } })

    await user.click(screen.getByRole('button', { name: 'Remover A' }))
    await waitFor(() => expect(nameField(1)).toHaveFocus())

    await user.click(screen.getByRole('button', { name: 'Remover B' }))
    await waitFor(() => expect(addHeader()).toHaveFocus())
  })
})
