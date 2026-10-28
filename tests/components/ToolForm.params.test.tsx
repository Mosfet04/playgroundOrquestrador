import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it } from 'vitest'

import { toolBodySchema } from '@/app/api/tools/schema'
import { ToolForm } from '@/components/management/tools/ToolForm'
import type { Tool } from '@/types/management'

import { renderWithIntl } from '../helpers/intl'
import { captureSave, paste, saveButton, stubBrowserApis, tool } from '../helpers/toolForm'

// P3-03: rota parametrizada ligada aos parâmetros (D-P3-03-2) e valor padrão
// convertido pelo tipo (D-P3-03-1).

beforeAll(stubBrowserApis)

const route = () => screen.getByLabelText(/^Rota/)
const MISSING = /sem parâmetro obrigatório de mesmo nome/

async function renderReady(value?: Tool) {
  const user = userEvent.setup()
  renderWithIntl(<ToolForm tool={value} onSuccess={() => {}} />)
  await waitFor(() => expect(saveButton()).toBeEnabled())
  return user
}

const withParams = (parameters: Tool['parameters'], over: Partial<Tool> = {}): Tool => ({
  ...tool,
  route: 'https://api.loja.example/v1/orders',
  parameters,
  ...over
})

describe('rota com placeholder sem parâmetro', () => {
  it('mostra o erro com o nome, oferece criar e recusa o envio sem request, com foco na rota', async () => {
    const bodies = captureSave()
    const user = await renderReady(withParams([]))
    await paste(user, route(), 'https://api.loja.example/v1/orders/{order_id}')

    expect(screen.getByText(MISSING)).toHaveTextContent('A rota usa order_id sem parâmetro obrigatório')
    expect(route()).toBeInvalid()
    expect(screen.getByRole('button', { name: 'Criar parâmetro order_id' })).toBeEnabled()
    expect(saveButton()).toBeEnabled()

    await user.click(saveButton())

    expect(route()).toHaveFocus()
    expect(bodies).toEqual([])
  })

  it('com dois faltantes: um botão por nome e "Criar os 2"', async () => {
    const user = await renderReady(withParams([]))
    await paste(user, route(), 'https://h.example/{a}/x/{b}?q={a}')

    expect(screen.getByText(MISSING)).toHaveTextContent('A rota usa a e b')
    expect(screen.getByRole('button', { name: 'Criar parâmetro a' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Criar parâmetro b' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Criar os 2' })).toBeVisible()
  })

  it('um clique cria o parâmetro obrigatório, travado, na rota, com o foco na descrição', async () => {
    const bodies = captureSave()
    const user = await renderReady(withParams([]))
    await paste(user, route(), 'https://api.loja.example/v1/orders/{order_id}')

    await user.click(screen.getByRole('button', { name: 'Criar parâmetro order_id' }))

    expect(screen.queryByText(MISSING)).toBeNull()
    expect(route()).not.toBeInvalid()
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Parâmetros criados: order_id')
    expect(screen.getByLabelText(/^Nome \*/, { selector: 'input[name^="parameters"]' })).toHaveValue('order_id')
    expect(screen.getByRole('combobox', { name: /^Tipo/ })).toHaveTextContent('string')
    const required = screen.getByRole('switch', { name: 'Obrigatório' })
    expect(required).toBeChecked()
    expect(required).toBeDisabled()
    expect(required).toHaveAccessibleDescription(/na rota.*Obrigatório porque o nome está na rota/)
    const description = screen.getByLabelText(/^Descrição \*/, { selector: 'input[name^="parameters"]' })
    expect(description).toHaveFocus()

    await user.type(description, 'Código do pedido')
    await user.click(saveButton())

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].parameters).toEqual([
      { name: 'order_id', type: 'string', description: 'Código do pedido', required: true }
    ])
    expect(toolBodySchema.safeParse(bodies[0]).success).toBe(true)
  })

  it('"Criar os 2" cria todos, com o foco na descrição do primeiro', async () => {
    const user = await renderReady(withParams([]))
    await paste(user, route(), 'https://h.example/{a}/{b}')

    await user.click(screen.getByRole('button', { name: 'Criar os 2' }))

    expect(screen.queryByText(MISSING)).toBeNull()
    expect(screen.getAllByText('na rota')).toHaveLength(2)
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Parâmetros criados: a e b')
    expect(screen.getAllByLabelText(/^Descrição \*/, { selector: 'input[name^="parameters"]' })[0]).toHaveFocus()
  })

  it('parâmetro com o nome na rota vai obrigatório mesmo gravado como opcional', async () => {
    const bodies = captureSave()
    const user = await renderReady(
      withParams([{ name: 'order_id', type: 'string', description: 'Código', required: false }], {
        route: 'https://api.loja.example/v1/orders/{order_id}'
      })
    )

    expect(screen.getByRole('switch', { name: 'Obrigatório' })).toBeChecked()
    await user.click(saveButton())

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].parameters).toMatchObject([{ name: 'order_id', required: true }])
  })

  it('renomear o parâmetro para fora da rota tira o chip, libera o Switch e o erro volta', async () => {
    const user = await renderReady(tool)
    const name = screen.getByLabelText(/^Nome \*/, { selector: 'input[name^="parameters"]' })
    expect(screen.getByText('na rota')).toBeVisible()

    await user.clear(name)
    await user.type(name, 'codigo')

    expect(screen.queryByText('na rota')).toBeNull()
    expect(screen.getByRole('switch', { name: 'Obrigatório' })).toBeEnabled()
    expect(screen.getByText(MISSING)).toHaveTextContent('order_id')
  })

  it.each(['{ x }', '{{ x }}', '{ }'])(
    'placeholder %s: erro na rota pedindo para tirar os espaços, sem "Criar", e o envio é recusado',
    async (placeholder) => {
      const bodies = captureSave()
      const user = await renderReady(withParams([]))
      await paste(user, route(), `https://api.loja.example/v1/${placeholder}`)

      expect(screen.getByText(/não pode ter espaço no começo nem no fim/)).toBeVisible()
      expect(screen.queryByRole('button', { name: /Criar parâmetro/ })).toBeNull()
      expect(route()).toBeInvalid()
      await user.click(saveButton())

      expect(route()).toHaveFocus()
      expect(bodies).toEqual([])
    }
  )

  it('parâmetro digitado com espaço nas pontas casa com a rota e vai aparado', async () => {
    const bodies = captureSave()
    const user = await renderReady(
      withParams([{ name: 'order_id ', type: 'string', description: 'Código', required: false }], {
        route: 'https://api.loja.example/v1/orders/{order_id}'
      })
    )

    expect(screen.queryByText(MISSING)).toBeNull()
    expect(screen.getByText('na rota')).toBeVisible()
    await user.click(saveButton())

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].parameters).toMatchObject([{ name: 'order_id', required: true }])
  })

  it('o nome do placeholder é comparado exato (caixa conta)', async () => {
    const user = await renderReady(tool)
    await paste(user, route(), 'https://api.loja.example/v1/orders/{Order_id}')

    expect(screen.getByText(MISSING)).toHaveTextContent('Order_id')
  })
})

describe('valor padrão por tipo', () => {
  const typed = withParams([
    { name: 'codigo', type: 'string', description: 'Código', required: false, default_value: 'A-1042' },
    { name: 'limite', type: 'integer', description: 'Limite', required: false, default_value: 10 },
    { name: 'taxa', type: 'float', description: 'Taxa', required: false, default_value: 0.5 },
    { name: 'ativo', type: 'boolean', description: 'Ativo', required: false, default_value: false },
    { name: 'filtro', type: 'object', description: 'Filtro', required: false, default_value: { loja: 'SP' } },
    { name: 'ids', type: 'array', description: 'Ids', required: false, default_value: [1, 2] },
    { name: 'sem', type: 'string', description: 'Sem padrão', required: false, default_value: null }
  ])

  it('reabre mostrando o valor gravado e salva com os mesmos tipos', async () => {
    const bodies = captureSave()
    const user = await renderReady(typed)

    const fields = screen.getAllByLabelText('Valor padrão')
    expect(fields.map((field) => (field as HTMLInputElement).value ?? '')).toEqual([
      'A-1042',
      '10',
      '0.5',
      '',
      '{"loja":"SP"}',
      '[1,2]',
      ''
    ])
    expect(fields[3]).toHaveTextContent('false')
    await user.click(saveButton())

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].parameters).toEqual([
      { name: 'codigo', type: 'string', description: 'Código', required: false, default_value: 'A-1042' },
      { name: 'limite', type: 'integer', description: 'Limite', required: false, default_value: 10 },
      { name: 'taxa', type: 'float', description: 'Taxa', required: false, default_value: 0.5 },
      { name: 'ativo', type: 'boolean', description: 'Ativo', required: false, default_value: false },
      { name: 'filtro', type: 'object', description: 'Filtro', required: false, default_value: { loja: 'SP' } },
      { name: 'ids', type: 'array', description: 'Ids', required: false, default_value: [1, 2] },
      { name: 'sem', type: 'string', description: 'Sem padrão', required: false }
    ])
    expect(toolBodySchema.safeParse(bodies[0]).success).toBe(true)
  })

  it('digitado: número, JSON e booleano do Select saem convertidos; vazio sai ausente', async () => {
    const bodies = captureSave()
    const user = await renderReady(
      withParams([
        { name: 'limite', type: 'integer', description: 'Limite', required: false },
        { name: 'filtro', type: 'object', description: 'Filtro', required: false },
        { name: 'ativo', type: 'boolean', description: 'Ativo', required: false },
        { name: 'vazio', type: 'float', description: 'Vazio', required: false }
      ])
    )
    const [limit, filter, active] = screen.getAllByLabelText('Valor padrão')

    await user.type(limit, ' 25 ')
    await paste(user, filter, '{"a": [1]}')
    await user.click(active)
    await user.click(await screen.findByRole('option', { name: 'true' }))
    await user.click(saveButton())

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].parameters).toMatchObject([
      { name: 'limite', default_value: 25 },
      { name: 'filtro', default_value: { a: [1] } },
      { name: 'ativo', default_value: true },
      { name: 'vazio' }
    ])
    expect(bodies[0].parameters).not.toContainEqual(expect.objectContaining({ name: 'vazio', default_value: expect.anything() }))
  })

  it.each([
    ['integer', 'dez', 'Use um número inteiro (ex.: 10)'],
    ['float', '0,5', 'Use um número com ponto (ex.: 0.5)'],
    ['object', '[1]', 'Use um objeto JSON válido (ex.: {"a": 1})'],
    ['array', '["a"', 'Use uma lista JSON válida (ex.: [1, 2])']
  ])('%s com %j é recusado no cliente: erro no campo, sem request, com foco', async (type, text, message) => {
    const bodies = captureSave()
    const user = await renderReady(
      withParams([{ name: 'p', type, description: 'P', required: false }])
    )
    const field = screen.getByLabelText('Valor padrão')

    await paste(user, field, text)

    expect(screen.getByText(message)).toBeVisible()
    expect(field).toBeInvalid()
    expect(field).toHaveAccessibleDescription(new RegExp(message.replace(/[()[\]{}.]/g, '\\$&')))
    await user.click(saveButton())
    expect(field).toHaveFocus()
    expect(bodies).toEqual([])
  })

  it('vazio não mostra erro', async () => {
    await renderReady(withParams([{ name: 'p', type: 'integer', description: 'P', required: false }]))

    expect(screen.queryByText(/Use um/)).toBeNull()
    expect(screen.getByLabelText('Valor padrão')).not.toBeInvalid()
  })

  it('trocar o tipo não apaga o texto: mostra o erro do novo tipo', async () => {
    const user = await renderReady(
      withParams([{ name: 'p', type: 'string', description: 'P', required: false, default_value: 'dez' }])
    )

    await user.click(screen.getByRole('combobox', { name: /^Tipo/ }))
    await user.click(await screen.findByRole('option', { name: 'integer' }))

    expect(screen.getByLabelText('Valor padrão')).toHaveValue('dez')
    expect(screen.getByText('Use um número inteiro (ex.: 10)')).toBeVisible()
  })

  it('boolean é um Select com "Sem valor padrão", true e false', async () => {
    const user = await renderReady(
      withParams([{ name: 'p', type: 'boolean', description: 'P', required: false }])
    )

    const select = screen.getByRole('combobox', { name: 'Valor padrão' })
    expect(select).toHaveTextContent('Sem valor padrão')
    await user.click(select)
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Sem valor padrão',
      'true',
      'false'
    ])
  })

  it('a nota de que o orquestrador não envia o valor padrão aparece uma vez e liga ao campo', async () => {
    await renderReady(
      withParams([
        { name: 'a', type: 'string', description: 'A', required: false },
        { name: 'b', type: 'string', description: 'B', required: false }
      ])
    )

    const note = 'O orquestrador não envia o valor padrão sozinho: ele serve de exemplo no preview.'
    expect(screen.getAllByText(note)).toHaveLength(1)
    for (const field of screen.getAllByLabelText('Valor padrão')) expect(field).toHaveAccessibleDescription(note)
  })
})

describe('lista de parâmetros', () => {
  it('remover leva o foco ao seguinte, ao anterior ou a "Adicionar parâmetro"', async () => {
    const user = await renderReady(
      withParams([
        { name: 'a', type: 'string', description: 'A', required: false },
        { name: 'b', type: 'string', description: 'B', required: false }
      ])
    )
    const names = () => screen.getAllByLabelText(/^Nome \*/, { selector: 'input[name^="parameters"]' })

    await user.click(screen.getByRole('button', { name: 'Remover a' }))
    expect(names()).toHaveLength(1)
    await waitFor(() => expect(names()[0]).toHaveFocus())

    await user.click(screen.getByRole('button', { name: 'Remover b' }))
    expect(screen.getByText('Nenhum parâmetro configurado')).toBeVisible()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Adicionar parâmetro' })).toHaveFocus())
  })

  it('"Adicionar parâmetro" foca o nome do bloco novo', async () => {
    const user = await renderReady(withParams([]))

    await user.click(screen.getByRole('button', { name: 'Adicionar parâmetro' }))

    const list = screen.getByRole('list', { name: 'Parâmetros' })
    await waitFor(() => expect(within(list).getByLabelText(/^Nome \*/)).toHaveFocus())
  })
})
