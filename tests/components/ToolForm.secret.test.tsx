import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, describe, expect, it } from 'vitest'

import { ToolForm } from '@/components/management/tools/ToolForm'
import type { Tool } from '@/types/management'

import { renderWithIntl } from '../helpers/intl'
import { captureSave, paste, saveButton, stubBrowserApis, tool } from '../helpers/toolForm'
import { SCHEMA_URL, schemaFixture } from '../msw/handlers'
import { server } from '../msw/server'

// P3-05 (D-P3-05-4): cada header tem o modo Texto | Segredo; Segredo usa o
// seletor; nome sensível com texto segue recusado, com a ação "Usar segredo".
// Spec: docs/design/P3-05.md §5 (V-P3-05-20..25).

beforeAll(stubBrowserApis)

const TEXT = 'Bearer abc123-valor-em-texto'

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
  renderWithIntl(<ToolForm tool={value} onSuccess={() => {}} />)
  await waitFor(() => expect(saveButton()).toBeEnabled())
  return user
}

const group = () => screen.getByRole('group', { name: 'Headers HTTP' })
const rows = () => within(group()).getAllByRole('listitem')
const mode = (name: string) => screen.getByRole('combobox', { name: `Modo do valor de ${name}` })
const addHeader = () => screen.getByRole('button', { name: 'Adicionar header' })

async function chooseMode(user: ReturnType<typeof userEvent.setup>, name: string, label: 'Texto' | 'Segredo') {
  await user.click(mode(name))
  await user.click(screen.getByRole('option', { name: label }))
}

async function addNamed(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(addHeader())
  const row = rows()[rows().length - 1]
  await user.type(within(row).getAllByRole('textbox')[0], name)
  return row
}

describe('V-20/V-21: modo e valor', () => {
  it('cada linha tem Nome, Modo, Valor, Estado e remover; os títulos das colunas incluem Modo', async () => {
    await renderReady(stored)

    expect(rows()).toHaveLength(3)
    for (const name of ['Accept', 'X-Api-Key', 'Authorization']) expect(mode(name)).toBeVisible()
    const titles = group().querySelector('div[aria-hidden="true"]')
    expect(titles).toHaveTextContent(/Nome\s*Modo\s*Valor\s*Estado/)
  })

  it('abre cada linha no modo certo: texto, referência (Segredo, separada) e oculto (Texto desabilitado)', async () => {
    await renderReady(stored)
    const [text, reference, hidden] = rows()

    expect(mode('Accept')).toHaveTextContent('Texto')
    expect(within(text).getByLabelText('Valor de Accept')).toHaveValue('application/json')

    expect(mode('X-Api-Key')).toHaveTextContent('Segredo')
    expect(within(reference).getByRole('combobox', { name: 'Formato (X-Api-Key)' })).toHaveTextContent('env:')
    expect(within(reference).getByRole('textbox', { name: 'Variável de ambiente (X-Api-Key)' })).toHaveValue(
      'LOJA_API_KEY'
    )
    expect(within(reference).getByText('referência')).toBeVisible()
    expect(within(reference).getByText('Gravada como')).toHaveTextContent('Gravada como env:LOJA_API_KEY')

    expect(mode('Authorization')).toBeDisabled()
    expect(mode('Authorization')).toHaveTextContent('Texto')
    expect(within(hidden).getByLabelText('Valor de Authorization (gravado, oculto)')).toHaveValue('***')
    expect(within(hidden).getByText('oculto')).toBeVisible()
  })

  it('o alvo da linha de Segredo descreve o chip e a referência montada', async () => {
    await renderReady(stored)

    expect(screen.getByRole('textbox', { name: 'Variável de ambiente (X-Api-Key)' })).toHaveAccessibleDescription(
      /referência.*Gravada como env:LOJA_API_KEY/
    )
  })

  it('linha nova abre em Texto; sem alvo, o chip é "—"', async () => {
    const user = await renderReady(tool)
    const row = await addNamed(user, 'X-Conta')

    expect(mode('X-Conta')).toHaveTextContent('Texto')
    await chooseMode(user, 'X-Conta', 'Segredo')

    expect(within(row).getByRole('combobox', { name: 'Formato (X-Conta)' })).toHaveTextContent('env:')
    expect(within(row).getAllByText('—')).toHaveLength(2)
    expect(within(row).getByText('Gravada como')).toHaveTextContent(/Gravada como\s*—\s*vazio/)
  })

  it('a referência montada vai no corpo', async () => {
    const bodies = captureSave()
    const user = await renderReady(stored)

    await user.clear(screen.getByRole('textbox', { name: 'Variável de ambiente (X-Api-Key)' }))
    await user.type(screen.getByRole('textbox', { name: 'Variável de ambiente (X-Api-Key)' }), 'OUTRA_API_KEY')
    await user.click(saveButton())

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].headers).toEqual({
      Accept: 'application/json',
      'X-Api-Key': 'env:OUTRA_API_KEY',
      Authorization: '***'
    })
  })

  it('file: com caminho absoluto é aceito', async () => {
    const bodies = captureSave()
    const user = await renderReady(stored)

    await user.click(screen.getByRole('combobox', { name: 'Formato (X-Api-Key)' }))
    await user.click(screen.getByRole('option', { name: 'file:' }))
    const target = screen.getByRole('textbox', { name: 'Caminho do arquivo (X-Api-Key)' })
    await paste(user, target, '/run/secrets/loja_key')
    await user.click(saveButton())

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].headers).toMatchObject({ 'X-Api-Key': 'file:/run/secrets/loja_key' })
  })
})

describe('V-22: nome sensível com texto e "Usar segredo"', () => {
  it('recusa com a mensagem sem o texto, mostra a ação e não envia', async () => {
    const bodies = captureSave()
    const user = await renderReady(tool)
    const row = await addNamed(user, 'Authorization')
    await paste(user, within(row).getAllByRole('textbox')[1], TEXT)

    await user.click(saveButton())

    const message = 'Authorization é sensível: use Segredo (referência env:, file:), nunca o valor.'
    expect(await within(row).findByText(message)).toBeVisible()
    expect(row.textContent).not.toContain(TEXT)
    expect(within(row).getByRole('button', { name: 'Usar segredo em Authorization' })).toHaveTextContent(
      'Usar segredo'
    )
    expect(bodies).toEqual([])
  })

  it('"Usar segredo" troca o modo, descarta o texto, foca o alvo e tira o erro', async () => {
    const bodies = captureSave()
    const user = await renderReady(tool)
    const row = await addNamed(user, 'Authorization')
    await paste(user, within(row).getAllByRole('textbox')[1], TEXT)
    await user.click(saveButton())
    await within(row).findByText(/é sensível/)

    await user.click(within(row).getByRole('button', { name: 'Usar segredo em Authorization' }))

    expect(mode('Authorization')).toHaveTextContent('Segredo')
    const target = within(row).getByRole('textbox', { name: 'Variável de ambiente (Authorization)' })
    expect(target).toHaveValue('')
    await waitFor(() => expect(target).toHaveFocus())
    expect(within(row).queryByText(/é sensível/)).toBeNull()
    expect(within(row).queryByRole('button', { name: /Usar segredo/ })).toBeNull()
    expect(document.body.textContent).not.toContain(TEXT)

    await user.type(target, 'LOJA_API_KEY')
    await user.click(saveButton())
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].headers).toEqual({ Authorization: 'env:LOJA_API_KEY' })
  })

  it('nome comum com texto não pede segredo', async () => {
    const bodies = captureSave()
    const user = await renderReady(tool)
    const row = await addNamed(user, 'X-Conta')
    await paste(user, within(row).getAllByRole('textbox')[1], 'valor livre')

    await user.click(saveButton())

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(within(row).queryByRole('button', { name: /Usar segredo/ })).toBeNull()
  })
})

describe('V-23: erros e avisos do Segredo', () => {
  it('sem alvo: "Informe o alvo da referência" e foco no alvo', async () => {
    const bodies = captureSave()
    const user = await renderReady(tool)
    const row = await addNamed(user, 'X-Conta')
    await chooseMode(user, 'X-Conta', 'Segredo')

    await user.click(saveButton())

    expect(await within(row).findByText('Informe o alvo da referência')).toBeVisible()
    const target = within(row).getByRole('textbox', { name: 'Variável de ambiente (X-Conta)' })
    expect(target).toBeInvalid()
    await waitFor(() => expect(target).toHaveFocus())
    expect(bodies).toEqual([])
  })

  it('alvo fora da regra do formato: a regra, sem repetir o texto', async () => {
    const bodies = captureSave()
    const user = await renderReady(tool)
    const row = await addNamed(user, 'X-Conta')
    await chooseMode(user, 'X-Conta', 'Segredo')
    await user.type(within(row).getByRole('textbox', { name: 'Variável de ambiente (X-Conta)' }), 'loja_key')

    await user.click(saveButton())

    const error = await within(row).findByText(/^Use MAIÚSCULAS, dígitos e _/)
    expect(error).not.toHaveTextContent('loja_key')
    expect(bodies).toEqual([])
  })

  it('depois do primeiro envio o erro acompanha cada mudança', async () => {
    const user = await renderReady(tool)
    const row = await addNamed(user, 'X-Conta')
    await chooseMode(user, 'X-Conta', 'Segredo')
    await user.click(saveButton())
    await within(row).findByText('Informe o alvo da referência')

    await user.type(within(row).getByRole('textbox', { name: 'Variável de ambiente (X-Conta)' }), 'LOJA_API_KEY')

    expect(within(row).queryByText('Informe o alvo da referência')).toBeNull()
  })

  it('referência gravada fora da regra e inalterada: aviso na linha e o envio segue; alterada, a regra vale', async () => {
    const bodies = captureSave()
    const user = await renderReady({ ...tool, headers: { 'X-Api-Key': 'env:loja_key' } })
    const [row] = rows()

    expect(within(row).getByText(/está fora da regra do orquestrador/)).toBeVisible()
    await user.click(saveButton())
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].headers).toEqual({ 'X-Api-Key': 'env:loja_key' })

    await user.type(within(row).getByRole('textbox', { name: 'Variável de ambiente (X-Api-Key)' }), 'x')
    await user.click(saveButton())
    expect(await within(row).findByText(/^Use MAIÚSCULAS, dígitos e _/)).toBeVisible()
    expect(bodies).toHaveLength(1)
  })
})

describe('V-24: valor oculto e o modo', () => {
  it('"Substituir" libera o Modo; "Manter oculto" restaura Texto desabilitado', async () => {
    const user = await renderReady(stored)

    await user.click(screen.getByRole('button', { name: 'Substituir o valor de Authorization' }))
    expect(mode('Authorization')).toBeEnabled()
    expect(mode('Authorization')).toHaveTextContent('Texto')

    await chooseMode(user, 'Authorization', 'Segredo')
    expect(screen.getByRole('textbox', { name: 'Variável de ambiente (Authorization)' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Manter o valor oculto de Authorization' }))
    expect(mode('Authorization')).toBeDisabled()
    expect(mode('Authorization')).toHaveTextContent('Texto')
    expect(screen.getByLabelText('Valor de Authorization (gravado, oculto)')).toHaveValue('***')
  })

  it('Substituir e trocar para Segredo envia a referência nova', async () => {
    const bodies = captureSave()
    const user = await renderReady(stored)

    await user.click(screen.getByRole('button', { name: 'Substituir o valor de Authorization' }))
    await chooseMode(user, 'Authorization', 'Segredo')
    await user.type(screen.getByRole('textbox', { name: 'Variável de ambiente (Authorization)' }), 'NOVA_API_KEY')
    await user.click(saveButton())

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].headers).toMatchObject({ Authorization: 'env:NOVA_API_KEY' })
  })
})

describe('V-25: trocar o modo limpa o valor', () => {
  it('Texto para Segredo e de volta deixa o valor vazio; a ajuda do grupo avisa', async () => {
    const user = await renderReady({ ...tool, headers: { 'X-Conta': 'valor' } })
    expect(group()).toHaveTextContent('Trocar o modo limpa o valor.')

    await chooseMode(user, 'X-Conta', 'Segredo')
    expect(screen.getByRole('textbox', { name: 'Variável de ambiente (X-Conta)' })).toHaveValue('')

    await user.type(screen.getByRole('textbox', { name: 'Variável de ambiente (X-Conta)' }), 'CONTA_API_KEY')
    await chooseMode(user, 'X-Conta', 'Texto')
    expect(screen.getByLabelText('Valor de X-Conta')).toHaveValue('')
  })

  it('digitar em Texto um valor com formato do schema passa a linha para Segredo, separando e mantendo o foco', async () => {
    const user = await renderReady(tool)
    const row = await addNamed(user, 'X-Conta')

    await user.type(within(row).getAllByRole('textbox')[1], 'env:CONTA_API_KEY')

    expect(mode('X-Conta')).toHaveTextContent('Segredo')
    const target = within(row).getByRole('textbox', { name: 'Variável de ambiente (X-Conta)' })
    expect(target).toHaveValue('CONTA_API_KEY')
    expect(within(row).getByRole('combobox', { name: 'Formato (X-Conta)' })).toHaveTextContent('env:')
    await waitFor(() => expect(target).toHaveFocus())
  })
})

describe('R3: referência colada em Texto', () => {
  it('espaço no fim da referência colada é descartado: chip, aviso e corpo coerentes', async () => {
    const bodies = captureSave()
    const user = await renderReady(tool)
    const row = await addNamed(user, 'X-Conta')

    await paste(user, within(row).getAllByRole('textbox')[1], 'env:OPENAI_API_KEY ')

    const target = within(row).getByRole('textbox', { name: 'Variável de ambiente (X-Conta)' })
    expect(target).toHaveValue('OPENAI_API_KEY')
    await user.click(saveButton())
    expect(within(row).queryByText(/^Use MAIÚSCULAS/)).toBeNull()
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].headers).toEqual({ 'X-Conta': 'env:OPENAI_API_KEY' })
  })
})

describe('H6: schema e só leitura', () => {
  it('sem schema: Modo e formato desabilitados; Nome e Texto seguem editáveis; Salvar desabilitado', async () => {
    server.use(http.get(SCHEMA_URL, () => HttpResponse.json({ success: false }, { status: 503 })))
    renderWithIntl(<ToolForm tool={stored} onSuccess={() => {}} />)

    await screen.findByRole('alert')
    expect(mode('Accept')).toBeDisabled()
    expect(mode('X-Api-Key')).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Formato (X-Api-Key)' })).toBeDisabled()
    expect(screen.getByLabelText('Valor de Accept')).toBeEnabled()
    expect(screen.getByLabelText('Nome do header 1')).toBeEnabled()
    expect(saveButton()).toBeDisabled()
  })

  it.each([
    ['falha', () => HttpResponse.json({ success: false }, { status: 503 })],
    ['carregando', () => new Promise<never>(() => {})]
  ])('schema %s: a referência gravada e válida não ganha aviso falso', async (_, respond) => {
    server.use(http.get(SCHEMA_URL, respond))
    renderWithIntl(<ToolForm tool={stored} onSuccess={() => {}} />)

    await waitFor(() => expect(mode('X-Api-Key')).toBeDisabled())
    expect(screen.getByText('Gravada como')).toHaveTextContent('Gravada como env:LOJA_API_KEY')
    expect(screen.queryByText(/não está entre os aceitos/)).toBeNull()
    expect(group().querySelector('.text-warning')).toBeNull()
  })

  it('só leitura: tudo desabilitado e a referência montada visível', async () => {
    server.use(
      http.get(SCHEMA_URL, () => HttpResponse.json({ success: true, data: { ...schemaFixture, writable: false } }))
    )
    renderWithIntl(<ToolForm tool={stored} onSuccess={() => {}} />)

    await screen.findByText(/somente leitura/)
    await waitFor(() => expect(mode('Accept')).toBeDisabled())
    expect(screen.getByRole('combobox', { name: 'Formato (X-Api-Key)' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Variável de ambiente (X-Api-Key)' })).toBeDisabled()
    expect(screen.getByText('Gravada como')).toHaveTextContent('Gravada como env:LOJA_API_KEY')
  })

  it('nenhum campo é de senha', async () => {
    await renderReady(stored)

    expect(document.querySelector('input[type="password"]')).toBeNull()
  })
})
