import { expect, test, type Page } from '@playwright/test'

import { FAKE_ORCHESTRATOR_URL } from '../playwright.config'
import { hydrated } from './hydration'
import { TEST_ENV } from './test-env'

// QA1-07 (#10): header em Segredo contra o fake com a regra do orquestrador
// (D-QA1-07-1): a referência só vale para host da allowlist do operador. O
// cenário do relatório (`Authorization` em `env:QA_TOKEN_API_KEY`) salva com o
// host confiável; fora dele o 422 cai no grupo de headers, com o motivo no toast.

const TRUSTED = 'https://api.exemplo.com/anything'
const UNTRUSTED = 'https://api.terceiro.example/anything'
const ADMIN = { Authorization: `Bearer ${TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN}` }
const toolUrl = (id: string) => `${FAKE_ORCHESTRATOR_URL}/admin/config/tools/${id}`

async function fillSecretTool(page: Page, id: string, route: string) {
  await page.goto('/tools/new')
  await hydrated(page)
  // Sem o schema o modo fica travado (e a troca automática também).
  await expect(page.getByRole('combobox', { name: /^Método HTTP/ })).toBeEnabled()
  await page.getByLabel(/^ID da tool/).fill(id)
  await page.getByLabel(/^Nome \*/).fill(`Tool ${id}`)
  await page.getByLabel(/^Descrição \*/).fill('Header com segredo')
  await page.getByLabel(/^Rota/).fill(route)
  await page.getByRole('button', { name: 'Adicionar header' }).click()
  const name = page.getByLabel('Nome do header 1')
  await name.pressSequentially('Authorization')
  // Troca automática (D-QA1-07-2): Segredo, com o aviso, e o foco no nome.
  await expect(page.getByRole('combobox', { name: 'Modo do valor de Authorization' })).toHaveText('Segredo')
  await expect(page.getByText('Authorization é sensível: o modo mudou para Segredo.')).toBeVisible()
  await expect(name).toBeFocused()
  const target = page.getByRole('textbox', { name: 'Variável de ambiente (Authorization)' })
  await expect(target).not.toHaveAttribute('aria-invalid')
  await target.fill('QA_TOKEN_API_KEY')
  return target
}

test('host confiável: Authorization em Segredo env:QA_TOKEN_API_KEY salva', async ({ page }) => {
  const id = 'e2e-qa-token'
  await fillSecretTool(page, id, TRUSTED)

  await page.getByRole('button', { name: 'Salvar' }).click()

  await expect(page.locator('[data-sonner-toast]').getByText('Tool salva')).toBeVisible()
  await expect(page).toHaveURL('/tools')
  const stored = await (await fetch(`${FAKE_ORCHESTRATOR_URL}/test/config/tools/${id}`)).json()
  expect(stored).toMatchObject({ route: TRUSTED, headers: { Authorization: 'env:QA_TOKEN_API_KEY' } })
  await fetch(`${toolUrl(id)}?hard=true`, { method: 'DELETE', headers: { ...ADMIN, 'If-Match': '"1"' } })
})

for (const [width, height] of [
  [1367, 889],
  [390, 844]
]) {
  test(`host não confiável em ${width} px: 422 no grupo, visível, e o toast com o motivo`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    const target = await fillSecretTool(page, `e2e-qa-terceiro-${width}`, UNTRUSTED)

    const saved = page.waitForResponse((response) => response.url().endsWith('/api/tools'))
    await page.getByRole('button', { name: 'Salvar' }).click()
    expect((await saved).status()).toBe(422)

    const error = page.locator('#headers-error')
    await expect(error).toHaveText(
      'O orquestrador recusou um header e não diz qual. Confira nomes e valores. Segredo só vale para host confiável do orquestrador.'
    )
    await expect(page.getByRole('list', { name: 'Headers HTTP' })).toHaveAttribute('aria-describedby', 'headers-error')
    await expect(target).toBeFocused()
    await expect(target).not.toHaveAttribute('aria-invalid')
    const toast = page.locator('[data-sonner-toast]')
    await expect(toast.getByText('Não foi possível salvar a tool', { exact: true })).toBeVisible()
    await expect(
      toast.getByText(
        'Um header foi recusado e o orquestrador não diz qual. Se usa segredo, a rota precisa ser de host confiável. Veja a seção Headers. (código 422)'
      )
    ).toBeVisible()
    // Nenhum host, URL nem nome de variável do servidor no texto.
    await expect(toast).not.toContainText(/terceiro|https?:|ALLOWLIST/)

    // O erro e a 1ª linha na área útil do `main`, que rola; o documento não rola.
    const inside = await page.evaluate(() => {
      const main = document.getElementById('conteudo')?.getBoundingClientRect()
      const box = document.getElementById('headers-error')?.getBoundingClientRect()
      const row = document.querySelector('ul[aria-label="Headers HTTP"] > li')?.getBoundingClientRect()
      if (!main || !box || !row) return null
      return {
        error: box.top >= main.top && box.bottom <= main.bottom,
        row: row.top >= main.top && row.bottom <= main.bottom,
        scrollY: window.scrollY,
        overflowX: document.documentElement.scrollWidth > window.innerWidth
      }
    })
    expect(inside).toEqual({ error: true, row: true, scrollY: 0, overflowX: false })
    await expect(page).toHaveURL('/tools/new')
  })
}

// D-QA1-07-3: em Segredo o alvo tem largura útil (≥ 280 px em 1367, ≥ 170 px em
// 390) e o placeholder cabe inteiro; D-QA1-07-4: com o modo parado, o erro do
// alvo aparecer não move a linha seguinte.
for (const [width, height, minimum] of [
  [1367, 889, 280],
  [390, 844, 170]
]) {
  test(`Segredo em ${width} px: alvo largo, placeholder inteiro e o erro do alvo sem salto`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/tools/new')
    await hydrated(page)
    await expect(page.getByRole('combobox', { name: /^Método HTTP/ })).toBeEnabled()
    const add = page.getByRole('button', { name: 'Adicionar header' })
    await add.click()
    await add.click()
    await page.getByLabel('Nome do header 1').fill('Authorization')
    const row = page.getByRole('list', { name: 'Headers HTTP' }).getByRole('listitem').first()
    const next = page.getByRole('list', { name: 'Headers HTTP' }).getByRole('listitem').nth(1)

    const measure = (label: RegExp) =>
      row.getByRole('textbox', { name: label }).evaluate((element) => {
        const input = element as HTMLInputElement
        const style = getComputedStyle(input)
        const context = document.createElement('canvas').getContext('2d')
        if (!context) return null
        context.font = style.font
        const needed =
          context.measureText(input.placeholder).width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
        return { width: input.getBoundingClientRect().width, fits: needed <= input.clientWidth, placeholder: input.placeholder }
      })

    const env = await measure(/^Variável de ambiente/)
    expect(env).toMatchObject({ fits: true, placeholder: 'OPENAI_API_KEY' })
    expect(env?.width).toBeGreaterThanOrEqual(minimum)
    await row.getByRole('combobox', { name: /^Formato/ }).click()
    await page.getByRole('option', { name: 'file:' }).click()
    const file = await measure(/^Caminho do arquivo/)
    expect(file).toMatchObject({ fits: true, placeholder: '/secrets/key' })
    expect(file?.width).toBeGreaterThanOrEqual(minimum)

    const before = (await next.boundingBox())?.y
    await row.getByRole('textbox', { name: /^Caminho do arquivo/ }).focus()
    await page.keyboard.press('Tab')
    const error = row.getByText('Informe o alvo da referência')
    await expect(error).toBeVisible()
    expect((await next.boundingBox())?.y).toBeCloseTo(before ?? -1, 0)
    // O slot (Gravada como, aviso, erro) começa onde o par começa.
    const format = await row.getByRole('combobox', { name: /^Formato/ }).boundingBox()
    const slot = await error.locator('xpath=ancestor::p[1]').boundingBox()
    expect(slot?.x).toBeCloseTo(format?.x ?? -1, 0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}
