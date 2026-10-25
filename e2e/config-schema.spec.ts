import { expect, test } from '@playwright/test'

import { hydrated } from './hydration'

// P3-01: as opções dos formulários vêm do /admin/schema do fake orchestrator
// (e2e/fake-orchestrator/server.ts), não de lista fixa do playground. Só
// leitura: nada é salvo aqui (o fluxo de salvar é config-crud*.spec.ts).

test('agent: embedder do schema e valor gravado fora das opções preservado', async ({ page }) => {
  // O seed grava o RAG do Agente Alfa com o provider `Fake`, que o schema não oferece.
  await page.goto('/agents')
  await page.getByRole('link', { name: 'Agente Alfa' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Editar agente' })).toBeVisible()
  await hydrated(page)

  const embedder = page.getByRole('combobox', { name: /Provedor de embedding/ })
  await expect(embedder).toBeEnabled()
  await expect(embedder).toHaveText('Fake')
  await embedder.click()
  await expect(page.getByRole('option', { name: 'fake-embed' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Azure OpenAI' })).toHaveCount(0)
})

test('tool: métodos e tipos de parâmetro do schema', async ({ page }) => {
  await page.goto('/tools/new')
  await hydrated(page)

  await page.getByRole('button', { name: 'Adicionar', exact: true }).click()
  const method = page.getByText(/^Método HTTP/).locator('..').getByRole('combobox')
  await expect(method).toBeEnabled()
  await method.click()
  await expect(page.getByRole('option')).toHaveText(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])
  await page.keyboard.press('Escape')

  await page.getByText(/^Tipo/).locator('..').getByRole('combobox').click()
  await expect(page.getByRole('option')).toHaveText([
    'string',
    'integer',
    'float',
    'boolean',
    'object',
    'array'
  ])
})
