import { expect, test } from '@playwright/test'

import { FAKE_ORCHESTRATOR_URL } from '../playwright.config'
import { hydrated } from './hydration'

// P2-06: CRUD de agents pela API Admin do fake orchestrator. Roda no projeto
// `config-agents`, depois do `chromium` (playwright.config.ts): o dashboard
// conta os agents da mesma config e não pode ver um agent criado aqui. Sozinho,
// sem rodar o resto da suíte antes (com a sessão de e2e/.auth já gravada):
// `pnpm exec playwright test e2e/config-crud.agents.spec.ts --no-deps`.

const ID = 'e2e-agente-crud'
const storedAgent = async (id: string) =>
  fetch(`${FAKE_ORCHESTRATOR_URL}/test/config/agents/${encodeURIComponent(id)}`)

test('cria, edita e exclui um agent pelo fake', async ({ page }) => {
  await page.goto('/agents/new')
  await hydrated(page)
  await page.getByLabel(/^ID do agente/).fill(ID)
  await page.getByLabel(/^Nome/).fill('Agente do e2e')
  await page.getByLabel(/^Modelo \*/).fill('fake-model')
  await page.getByRole('button', { name: 'Salvar' }).click()

  await expect(page.getByText('Agente salvo').last()).toBeVisible()
  await expect(page).toHaveURL('/agents')
  expect(await (await storedAgent(ID)).json()).toMatchObject({
    id: ID,
    nome: 'Agente do e2e',
    factory_ia_model: 'ollama',
    version: 1
  })

  await page.getByRole('link', { name: 'Agente do e2e' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Editar agente' })).toBeVisible()
  await hydrated(page)
  await page.getByLabel(/^Nome/).fill('Agente do e2e editado')
  await page.getByRole('button', { name: 'Salvar' }).click()

  await expect(page.getByText('Agente salvo').last()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Agente do e2e editado' }).first()).toBeVisible()
  // O PUT mesclou o documento: os campos que o form não mostra ficaram.
  expect(await (await storedAgent(ID)).json()).toMatchObject({
    nome: 'Agente do e2e editado',
    num_history_runs: 5,
    markdown: true,
    version: 2
  })

  await page.getByRole('link', { name: 'Agente do e2e editado' }).first().click()
  await hydrated(page)
  await page.getByRole('button', { name: 'Excluir agente' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir' }).click()

  await expect(page.getByText('Agente excluído')).toBeVisible()
  await expect(page).toHaveURL('/agents')
  await expect(page.getByRole('link', { name: 'Agente do e2e editado' })).toHaveCount(0)
  expect((await storedAgent(ID)).status).toBe(404)
})

test('id que já existe: "Já existe um agente com este ID" e o form fica', async ({ page }) => {
  await page.goto('/agents/new')
  await hydrated(page)
  await page.getByLabel(/^ID do agente/).fill('agente-alfa')
  await page.getByLabel(/^Nome/).fill('Repetido')
  await page.getByLabel(/^Modelo \*/).fill('fake-model')
  await page.getByRole('button', { name: 'Salvar' }).click()

  await expect(page.getByText('Já existe um agente com este ID')).toBeVisible()
  await expect(page).toHaveURL('/agents/new')
})

test('agent do seed com prompt em lista: abre unido por linha e salvar grava texto', async ({ page }) => {
  await page.goto('/agents')
  await page.getByRole('link', { name: 'Agente Beta' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Editar agente' })).toBeVisible()
  await expect(page.getByLabel('Prompt do sistema')).toHaveValue('Você é o Beta.\nResponda curto.')
  await hydrated(page)
  // Reexecução local com o fake reaproveitado: a versão lida antes vale a base.
  const before = (await (await storedAgent('agente-beta')).json()).version as number
  await page.getByRole('button', { name: 'Salvar' }).click()

  await expect(page.getByText('Agente salvo').last()).toBeVisible()
  expect(await (await storedAgent('agente-beta')).json()).toMatchObject({
    prompt: 'Você é o Beta.\nResponda curto.',
    version: before + 1
  })
})
