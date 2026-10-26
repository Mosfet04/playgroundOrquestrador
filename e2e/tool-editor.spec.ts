import { expect, test, type Page } from '@playwright/test'

import { FAKE_ORCHESTRATOR_URL } from '../playwright.config'
import { hydrated } from './hydration'

// P3-03: o editor de tool HTTP contra o fake orchestrator (sem page.route):
// rota parametrizada ligada aos parâmetros, valor padrão por tipo, headers
// (texto, referência e `***` mantido), preview da requisição e reabrir com os
// mesmos valores.

const ID = 'e2e-tool-editor'
const ROUTE = 'https://api.loja.example/v1/orders/{order_id}'
const storedTool = async (id: string) =>
  (await fetch(`${FAKE_ORCHESTRATOR_URL}/test/config/tools/${encodeURIComponent(id)}`)).json()

const parameter = (page: Page, index: number) =>
  page.getByRole('list', { name: 'Parâmetros' }).getByRole('listitem').nth(index)
const request = (page: Page) => page.getByRole('region', { name: 'Requisição' })

async function chooseType(page: Page, index: number, type: string) {
  await parameter(page, index).getByRole('combobox', { name: /^Tipo/ }).click()
  await page.getByRole('option', { name: type, exact: true }).click()
}

test('cria e edita uma tool com rota parametrizada, padrões tipados e headers', async ({ page }) => {
  const writes: string[] = []
  page.on('request', (req) => {
    if (req.url().includes('/api/tools') && req.method() !== 'GET') writes.push(`${req.method()} ${req.url()}`)
  })
  await page.goto('/tools/new')
  await hydrated(page)
  await expect(page.getByRole('combobox', { name: /^Método HTTP/ })).toBeEnabled()
  await page.getByLabel(/^ID da tool/).fill(ID)
  await page.getByLabel(/^Nome \*/).fill('Pedidos do e2e')
  await page.getByLabel(/^Descrição \*/).fill('Consulta um pedido')

  // Placeholder sem parâmetro: erro com ação de um clique; Salvar não envia.
  await page.getByLabel(/^Rota/).fill(ROUTE)
  await expect(page.getByText('A rota usa order_id sem parâmetro obrigatório de mesmo nome.')).toBeVisible()
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByLabel(/^Rota/)).toBeFocused()
  expect(writes).toEqual([])
  await page.getByRole('button', { name: 'Criar parâmetro order_id' }).click()
  await expect(page.getByText('A rota usa')).toHaveCount(0)
  await expect(parameter(page, 0).getByLabel('Descrição *')).toBeFocused()
  await expect(parameter(page, 0).getByText('na rota', { exact: true })).toBeVisible()
  await expect(parameter(page, 0).getByRole('switch', { name: 'Obrigatório' })).toBeDisabled()
  await parameter(page, 0).getByLabel('Descrição *').fill('Código do pedido')
  await parameter(page, 0).getByLabel('Valor padrão').fill('T 77')

  // Parâmetros fora da rota, com o valor padrão de cada tipo.
  const extras = [
    ['limit', 'integer', '10'],
    ['taxa', 'float', '0.5'],
    ['filtro', 'object', '{"loja": "SP"}'],
    ['ids', 'array', '[1, 2]']
  ] as const
  for (const [index, [name, type, value]] of extras.entries()) {
    await page.getByRole('button', { name: 'Adicionar parâmetro' }).click()
    const block = parameter(page, index + 1)
    await expect(block.getByLabel('Nome *')).toBeFocused()
    await block.getByLabel('Nome *').fill(name)
    await chooseType(page, index + 1, type)
    await block.getByLabel('Descrição *').fill(`Parâmetro ${name}`)
    await block.getByLabel('Valor padrão').fill(value)
  }
  await page.getByRole('button', { name: 'Adicionar parâmetro' }).click()
  const flag = parameter(page, 5)
  await flag.getByLabel('Nome *').fill('ativo')
  await chooseType(page, 5, 'boolean')
  await flag.getByLabel('Descrição *').fill('Só ativos')
  await flag.getByRole('combobox', { name: 'Valor padrão' }).click()
  await page.getByRole('option', { name: 'true', exact: true }).click()

  // Valor padrão inválido para o tipo: erro no campo.
  await parameter(page, 1).getByLabel('Valor padrão').fill('dez')
  await expect(page.getByText('Use um número inteiro (ex.: 10)')).toBeVisible()
  await parameter(page, 1).getByLabel('Valor padrão').fill('10')
  await expect(page.getByText('Use um número inteiro (ex.: 10)')).toHaveCount(0)

  // Headers: texto, referência.
  await page.getByRole('button', { name: 'Adicionar header' }).click()
  await page.getByLabel('Nome do header 1').fill('Accept')
  await page.getByLabel('Valor de Accept').fill('application/json')
  await page.getByRole('button', { name: 'Adicionar header' }).click()
  await page.getByLabel('Nome do header 2').fill('X-Api-Key')
  await page.getByLabel('Valor de X-Api-Key').fill('env:LOJA_API_KEY')

  // Preview: GET, rota com o padrão, demais parâmetros em Query, headers.
  await expect(request(page)).toContainText('GET https://api.loja.example/v1/orders/T%2077')
  await expect(request(page)).toContainText('limit=10')
  // Array na query vira chave repetida (o preview é ilustrativo para objeto).
  await expect(request(page)).toContainText('ids=1')
  await expect(request(page)).toContainText('ids=2')
  await expect(request(page)).toContainText('X-Api-Key: env:LOJA_API_KEY')
  await expect(request(page)).toContainText('Accept: ••••••')
  await expect(request(page)).not.toContainText('application/json')

  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Tool salva').last()).toBeVisible()
  await expect(page).toHaveURL('/tools')

  expect(await storedTool(ID)).toMatchObject({
    route: ROUTE,
    headers: { Accept: 'application/json', 'X-Api-Key': 'env:LOJA_API_KEY' },
    parameters: [
      { name: 'order_id', type: 'string', required: true, default_value: 'T 77' },
      { name: 'limit', type: 'integer', default_value: 10 },
      { name: 'taxa', type: 'float', default_value: 0.5 },
      { name: 'filtro', type: 'object', default_value: { loja: 'SP' } },
      { name: 'ids', type: 'array', default_value: [1, 2] },
      { name: 'ativo', type: 'boolean', default_value: true }
    ],
    version: 1
  })

  // Reabrir: mesmos valores; o texto volta oculto e a referência como está.
  await page.getByRole('link', { name: 'Pedidos do e2e' }).first().click()
  await hydrated(page)
  await expect(parameter(page, 0).getByLabel('Valor padrão')).toHaveValue('T 77')
  await expect(parameter(page, 1).getByLabel('Valor padrão')).toHaveValue('10')
  await expect(parameter(page, 2).getByLabel('Valor padrão')).toHaveValue('0.5')
  await expect(parameter(page, 3).getByLabel('Valor padrão')).toHaveValue('{"loja":"SP"}')
  await expect(parameter(page, 4).getByLabel('Valor padrão')).toHaveValue('[1,2]')
  await expect(parameter(page, 5).getByRole('combobox', { name: 'Valor padrão' })).toHaveText('true')
  await expect(page.getByLabel('Valor de Accept (gravado, oculto)')).toHaveValue('***')
  await expect(page.getByLabel('Valor de X-Api-Key')).toHaveValue('env:LOJA_API_KEY')

  // Editar: o `***` segue como veio; o outro valor é trocado por uma referência.
  await page.getByRole('button', { name: 'Adicionar header' }).click()
  await page.getByLabel('Nome do header 3').fill('X-Conta')
  await page.getByLabel('Valor de X-Conta').fill('valor-em-texto')
  await page.getByLabel(/^Descrição \*/).first().fill('Consulta um pedido (editada)')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Tool salva').last()).toBeVisible()
  // O toast do 1º salvar pode seguir na tela: confere o documento gravado.
  await expect
    .poll(() => storedTool(ID))
    .toMatchObject({
      description: 'Consulta um pedido (editada)',
      headers: { Accept: 'application/json', 'X-Api-Key': 'env:LOJA_API_KEY', 'X-Conta': 'valor-em-texto' },
      version: 2
    })

  // Substituir e a origem da rota: mudar a origem sem trocar a linha oculta é
  // recusado pelo orquestrador (422 em headers), com o erro no grupo.
  await page.getByRole('link', { name: 'Pedidos do e2e' }).first().click()
  await hydrated(page)
  await page.getByLabel(/^Rota/).fill('https://outro.example/v1/orders/{order_id}')
  await expect(page.getByText(/A origem da rota mudou/)).toContainText('Accept')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText(/O orquestrador recusou algum header e não diz qual/)).toBeVisible()
  await expect(page.getByLabel('Valor de Accept (gravado, oculto)')).toBeFocused()

  await page.getByRole('button', { name: 'Substituir o valor de Accept' }).click()
  await expect(page.getByLabel('Novo valor de Accept')).toBeFocused()
  await page.getByLabel('Novo valor de Accept').fill('env:ACCEPT')
  await page.getByLabel('Valor de X-Conta (gravado, oculto)').waitFor()
  await page.getByRole('button', { name: 'Substituir o valor de X-Conta' }).click()
  await page.getByLabel('Novo valor de X-Conta').fill('env:CONTA')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Tool salva').last()).toBeVisible()
  await expect
    .poll(() => storedTool(ID))
    .toMatchObject({
      route: 'https://outro.example/v1/orders/{order_id}',
      headers: { Accept: 'env:ACCEPT', 'X-Conta': 'env:CONTA' },
      version: 3
    })

  // Limpeza: excluir de vez.
  await page.getByRole('link', { name: 'Pedidos do e2e' }).first().click()
  await hydrated(page)
  await page.getByRole('button', { name: 'Excluir tool' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir' }).click()
  await expect(page.getByText('Tool excluída')).toBeVisible()
  expect((await fetch(`${FAKE_ORCHESTRATOR_URL}/test/config/tools/${ID}`)).status).toBe(404)
})
