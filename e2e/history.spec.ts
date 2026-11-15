import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { FAKE_ORCHESTRATOR_URL } from '../playwright.config'
import { hydrated } from './hydration'
import { TEST_ENV } from './test-env'

// P4-04: histórico e restaurar contra o fake (diário em memória, restore pelo
// caminho do PUT). Cada teste cria a sua tool direto no fake, com um id próprio
// (as listas de tools dos outros specs vêm de page.route), e a apaga no fim.
// O id muda a cada execução: como no orquestrador real, excluir não apaga o
// histórico, e o fake reaproveitado fora da CI (`reuseExistingServer`) o guarda.
const RUN = Date.now().toString(36)

const admin = { Authorization: `Bearer ${TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN}` }
const TOOLS = `${FAKE_ORCHESTRATOR_URL}/admin/config/tools`
// Header em texto: o valor nunca pode chegar ao browser.
const HEADER_TEXT = 'texto-e2e-do-header'

const toolDoc = (id: string, name: string) => ({
  id,
  name,
  description: 'Histórico no e2e',
  route: 'https://historico.example/v1',
  http_method: 'GET',
  parameters: [],
  headers: { 'X-Trace': HEADER_TEXT }
})

// v1 com o header em texto; v2 troca o nome e mantém o header pela máscara.
async function seedTool(request: APIRequestContext, id: string) {
  expect((await request.post(TOOLS, { headers: admin, data: toolDoc(id, 'Histórico v1') })).status()).toBe(201)
  const put = await request.put(`${TOOLS}/${id}`, {
    headers: { ...admin, 'If-Match': '"1"' },
    data: { ...toolDoc(id, 'Histórico v2'), headers: { 'X-Trace': '***' } }
  })
  expect(put.status()).toBe(200)
}

const removeTool = async (request: APIRequestContext, id: string) => {
  const current = await request.get(`${TOOLS}/${id}`, { headers: admin })
  if (!current.ok()) return
  const { version } = await current.json()
  await request.delete(`${TOOLS}/${id}?hard=true`, { headers: { ...admin, 'If-Match': `"${version}"` } })
}

async function openHistory(page: Page, id: string) {
  await page.goto(`/tools/${id}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Editar tool' })).toBeVisible()
  await hydrated(page)
  await page.getByRole('button', { name: 'Histórico' }).click()
  const sheet = page.getByRole('dialog', { name: 'Histórico de versões' })
  await expect(sheet.getByRole('list', { name: 'Versões' })).toBeVisible()
  return sheet
}

const row = (sheet: ReturnType<Page['getByRole']>, version: number) =>
  sheet.getByRole('listitem').filter({ has: sheet.page().getByText(`v${version}`, { exact: true }) })

test('tool: o histórico lista as versões com o diff, sem valor de header; restaurar aplica e mostra a revisão nova', async ({
  page,
  request
}) => {
  const id = `historico-restaurar-${RUN}`
  await seedTool(request, id)
  try {
    // O BFF não deixa passar o texto do header (nem na leitura direta).
    const history = await page.request.get(`/api/tools/${id}/history`)
    expect(history.ok()).toBe(true)
    expect(await history.text()).not.toContain(HEADER_TEXT)

    // Com o Sheet aberto o resto da página fica aria-hidden.
    const badge = page.getByRole('heading', { level: 1, includeHidden: true }).locator('..').getByText(/^v\d+$/)
    const sheet = await openHistory(page, id)
    await expect(badge).toHaveText('v2')
    await expect(row(sheet, 2).getByText('Atual', { exact: true })).toBeVisible()
    await expect(row(sheet, 2).getByRole('button', { name: /Restaurar/ })).toHaveCount(0)
    await expect(sheet.getByRole('status')).toHaveText('Fim: 2 de 2 versões')
    await row(sheet, 2).getByRole('button', { name: 'Ver alterações' }).click()
    const diff = row(sheet, 2).getByRole('region', { name: 'Campos alterados na v2' })
    await expect(diff.getByText('Histórico v1')).toBeVisible()
    await expect(diff.getByText('Histórico v2')).toBeVisible()
    await expect(page.getByText(HEADER_TEXT)).toHaveCount(0)

    await row(sheet, 1).getByRole('button', { name: 'Restaurar a v1' }).click()
    const dialog = page.getByRole('alertdialog', { name: 'Restaurar a v1?' })
    await expect(dialog.getByText('Hoje (v2) × depois de restaurar.', { exact: false })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused()
    await dialog.getByRole('button', { name: 'Restaurar a v1' }).click()

    const status = page.locator('[aria-live="polite"][aria-atomic="true"]')
    await expect(status).toContainText('v1 restaurada como v3.')
    await expect(status).toContainText(/Mudança aplicada na revisão \d+ do runtime\./)
    await expect(sheet).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
    await expect(page.getByLabel(/^Nome \*/).first()).toHaveValue('Histórico v1')
    // Badge da versão ao lado do título (D-P4-04-7).
    await expect(badge).toHaveText('v3')

    // A máscara do histórico manteve o valor gravado do header.
    const stored = await (await request.get(`${FAKE_ORCHESTRATOR_URL}/test/config/tools/${id}`)).json()
    expect(stored).toMatchObject({ version: 3, name: 'Histórico v1', headers: { 'X-Trace': HEADER_TEXT } })

    // Reaberto, o histórico recarrega com a v3 atual.
    await page.getByRole('button', { name: 'Histórico' }).click()
    await expect(row(sheet, 3).getByText('Atual', { exact: true })).toBeVisible()
  } finally {
    await removeTool(request, id)
  }
})

test('tool: 412 ao restaurar abre o conflito em modo restaurar, e recarregar traz a versão atual', async ({
  page,
  request
}) => {
  const id = `historico-conflito-${RUN}`
  await seedTool(request, id)
  try {
    const sheet = await openHistory(page, id)
    // Outra pessoa grava a v3 depois que o editor leu a v2.
    const put = await request.put(`${TOOLS}/${id}`, {
      headers: { ...admin, 'If-Match': '"2"' },
      data: { ...toolDoc(id, 'De outra pessoa'), headers: { 'X-Trace': '***' } }
    })
    expect(put.status()).toBe(200)

    await row(sheet, 1).getByRole('button', { name: 'Restaurar a v1' }).click()
    await page.getByRole('alertdialog', { name: 'Restaurar a v1?' }).getByRole('button', { name: 'Restaurar a v1' }).click()

    const conflict = page.getByRole('dialog', { name: 'A tool mudou' })
    await expect(conflict).toContainText('Uma versão mais nova (v3) foi salva antes de restaurar a v1.')
    await expect(conflict.getByRole('button', { name: 'Salvar as minhas por cima' })).toHaveCount(0)
    await conflict.getByRole('button', { name: 'Recarregar a versão atual' }).click()

    await expect(page.getByLabel(/^Nome \*/).first()).toHaveValue('De outra pessoa')
    const stored = await (await request.get(`${FAKE_ORCHESTRATOR_URL}/test/config/tools/${id}`)).json()
    expect(stored).toMatchObject({ version: 3, name: 'De outra pessoa' })
  } finally {
    await removeTool(request, id)
  }
})
