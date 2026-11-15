import { expect, test, type Page } from '@playwright/test'

import { hydrated } from './hydration'
import { TEST_ENV } from './test-env'

// P4-05: /settings com os dados do fake (saúde, store gravável e provedores do
// /admin/schema), o indicador da casca como link para ela e o "Recarregar
// runtime", que leva a revisão nova ao indicador sem reler a saúde. A recarga
// sobe a revisão do fake; os outros specs comparam a revisão com a da própria
// escrita, então não se cruzam. Degradado e fora do ar: settings.health.spec.ts.

const SECRETS = [
  TEST_ENV.ORCHESTRATOR_API_KEY_RUN,
  TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN,
  TEST_ENV.ORCHESTRATOR_URL
]

// Leituras de saúde que o browser fez (uma por carga da casca).
function countHealthReads(page: Page) {
  const reads: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/orchestrator/runtime') reads.push(request.url())
  })
  return reads
}

test('o indicador leva à /settings, que mostra os dados do fake com uma leitura de saúde só', async ({ page }) => {
  const reads = countHealthReads(page)
  await page.goto('/agents')
  await hydrated(page)
  const shell = page.getByRole('link', { name: /^Orquestrador online, revisão \d+$/ })
  await expect(shell).toBeVisible()
  await expect(shell).toContainText(/^online · rev\. \d+/)

  await shell.click()

  await expect(page).toHaveURL('/settings')
  await expect(page.getByRole('heading', { level: 1, name: 'Configurações' })).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Configurações' })
  ).toHaveAttribute('aria-current', 'page')
  const orchestrator = page.getByRole('region', { name: 'Orquestrador' })
  await expect(orchestrator.locator('header')).toContainText('Saudável')
  const checks = orchestrator.getByRole('list', { name: 'Checks de saúde' }).getByRole('listitem')
  await expect(checks).toHaveText([
    /Banco de dados \(MongoDB\)\s*Saudável/,
    /Memória\s*Saudável\s*Uso 42,3% · 9,1 GB livres/,
    /Telemetria \(OTLP\)\s*Configurada/
  ])
  await expect(orchestrator).not.toContainText('TracerProvider')
  await expect(page.getByRole('region', { name: 'Config store' })).toContainText('Gravável')
  const chat = page.getByRole('region', { name: 'Provedores de chat' })
  await expect(chat.getByRole('row')).toHaveCount(4)
  await expect(chat.getByRole('row', { name: /fake-llm/ })).toContainText('Exige base URL')
  await expect(page.getByRole('region', { name: 'Provedores de embedder' }).getByRole('row')).toHaveCount(4)
  expect(reads).toHaveLength(1)

  const body = await page.content()
  for (const secret of SECRETS) expect(body).not.toContain(secret)
})

test('"Recarregar runtime": confirmar mostra a revisão nova na página e no indicador, sem reler a saúde', async ({
  page
}) => {
  const reads = countHealthReads(page)
  await page.goto('/settings')
  await hydrated(page)
  const orchestrator = page.getByRole('region', { name: 'Orquestrador' })
  await expect(orchestrator.locator('header')).toContainText('Saudável')
  const before = Number(await orchestrator.locator('dt:text-is("Revisão do runtime") + dd').textContent())

  await orchestrator.getByRole('button', { name: 'Recarregar runtime' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Recarregar o runtime?' })
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await expect(dialog).toContainText(`Revisão em vigor: ${before}`)
  const reloaded = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/config/reload'
  )
  await dialog.getByRole('button', { name: 'Recarregar runtime' }).click()
  const response = await reloaded
  const text = await response.text()
  for (const secret of SECRETS) expect(text).not.toContain(secret)
  const { runtimeRevision } = JSON.parse(text) as { runtimeRevision: number }
  expect(runtimeRevision).toBeGreaterThan(before)

  await expect(dialog).toBeHidden()
  await expect(page.locator('[aria-live="polite"][aria-atomic="true"]')).toHaveText(
    `Runtime recarregado. Revisão em vigor: ${runtimeRevision} (era ${before}).`
  )
  await expect(orchestrator.locator('dt:text-is("Revisão do runtime") + dd')).toHaveText(String(runtimeRevision))
  await expect(
    page.getByRole('link', { name: `Orquestrador online, revisão ${runtimeRevision}` })
  ).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  expect(reads).toHaveLength(1)
})
