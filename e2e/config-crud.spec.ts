import { expect, test } from '@playwright/test'

import { FAKE_ORCHESTRATOR_URL } from '../playwright.config'
import { hydrated } from './hydration'

// P2-06: CRUD de tools pela API Admin do fake orchestrator (sem Mongo e sem
// page.route): criar, editar e excluir pelo editor de hoje; header em texto
// volta mascarado e salvar sem mexer não apaga o valor; 422 do orquestrador
// aparece no campo, sem o valor na resposta do BFF. O CRUD de agents fica em
// config-crud.agents.spec.ts (roda depois do dashboard, que conta os agents).

const ID = 'e2e-tool-crud'
const SECRET = 'valor-em-texto-do-header'
// Documento gravado no fake, sem a máscara (rota de teste, não existe no real).
const storedTool = async (id: string) =>
  (await fetch(`${FAKE_ORCHESTRATOR_URL}/test/config/tools/${encodeURIComponent(id)}`)).json()

test('cria, edita (header mascarado mantido) e exclui uma tool pelo fake', async ({ page }) => {
  await page.goto('/tools/new')
  await hydrated(page)
  await page.getByLabel(/^ID da tool/).fill(ID)
  await page.getByLabel(/^Nome/).fill('Tool do e2e')
  await page.getByLabel(/^Descrição/).fill('Criada pelo e2e')
  await page.getByLabel(/^Rota/).fill('https://clima.example.com/v1/previsao')
  await page.getByPlaceholder(/^Chave/).fill('X-Conta')
  await page.getByPlaceholder(/^Valor/).fill(SECRET)
  await page.getByRole('button', { name: 'Adicionar header' }).click()
  await page.getByRole('button', { name: 'Salvar' }).click()

  await expect(page.getByText('Tool salva').last()).toBeVisible()
  await expect(page).toHaveURL('/tools')
  await page.getByRole('link', { name: 'Tool do e2e' }).first().click()

  // Editar: o header volta mascarado e o valor não chega ao browser.
  await expect(page.getByRole('heading', { level: 1, name: 'Editar tool' })).toBeVisible()
  await expect(page.getByText('***')).toBeVisible()
  await expect(page.getByText(SECRET)).toHaveCount(0)
  await hydrated(page)
  await page.getByLabel(/^Nome/).fill('Tool do e2e editada')
  await page.getByRole('button', { name: 'Salvar' }).click()

  // O toast do 1º salvar pode seguir na tela: confere sempre o último.
  await expect(page.getByText('Tool salva').last()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Tool do e2e editada' }).first()).toBeVisible()
  const stored = await storedTool(ID)
  expect(stored).toMatchObject({ name: 'Tool do e2e editada', headers: { 'X-Conta': SECRET }, version: 2 })

  // Excluir de vez (hard): some da lista e do fake.
  await page.getByRole('link', { name: 'Tool do e2e editada' }).first().click()
  await hydrated(page)
  await page.getByRole('button', { name: 'Excluir tool' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir' }).click()

  await expect(page.getByText('Tool excluída')).toBeVisible()
  await expect(page).toHaveURL('/tools')
  await expect(page.getByRole('link', { name: 'Tool do e2e editada' })).toHaveCount(0)
  expect((await fetch(`${FAKE_ORCHESTRATOR_URL}/test/config/tools/${ID}`)).status).toBe(404)
})

test('422 do orquestrador aparece no campo Headers, sem o valor na resposta do BFF', async ({ page }) => {
  await page.goto('/tools/new')
  await hydrated(page)
  await page.getByLabel(/^ID da tool/).fill('e2e-tool-recusada')
  await page.getByLabel(/^Nome/).fill('Tool recusada')
  await page.getByLabel(/^Descrição/).fill('Header sensível em texto')
  await page.getByLabel(/^Rota/).fill('https://clima.example.com/v1/previsao')
  // Nome sensível só aceita referência (env:/file:): o orquestrador recusa o texto.
  await page.getByPlaceholder(/^Chave/).fill('Authorization')
  await page.getByPlaceholder(/^Valor/).fill('Bearer texto-recusado')
  await page.getByRole('button', { name: 'Adicionar header' }).click()

  const saved = page.waitForResponse((response) => response.url().endsWith('/api/tools'))
  await page.getByRole('button', { name: 'Salvar' }).click()
  const response = await saved

  expect(response.status()).toBe(422)
  expect(await response.text()).not.toContain('texto-recusado')
  const headersBlock = page.getByText('Headers HTTP').locator('..')
  await expect(headersBlock.getByText('Valor recusado pelo orquestrador')).toBeVisible()
  await expect(page.getByText('Não foi possível salvar a tool (código 422)')).toBeVisible()
  await expect(page).toHaveURL('/tools/new')
})
