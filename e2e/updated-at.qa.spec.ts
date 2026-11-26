import { expect, test } from '@playwright/test'

// QA1-09 (QA): leitura pura da config do seed do fake (nada é criado nem
// alterado): a data do orquestrador chega à coluna "Atualizado" e o documento
// com `updated_at: null` (store YAML) mostra "—" com "N/D" para leitor de tela,
// sem "Invalid Date". Roda no projeto `chromium`, antes do CRUD (config-agents).

test('lista de agents: agente com data mostra o horário e os sem data, "—"', async ({ page }) => {
  await page.goto('/agents')

  const beta = page.getByRole('row', { name: /Agente Beta/ })
  await expect(beta.locator('time')).toHaveAttribute('datetime', '2026-11-20T09:30:00.000Z')
  await expect(beta.locator('time')).toHaveText(/^\d{2}\/\d{2}, \d{2}:\d{2}$/)

  const alfa = page.getByRole('row', { name: /Agente Alfa/ })
  await expect(alfa.locator('time')).toHaveCount(0)
  await expect(alfa.getByRole('cell').nth(4)).toHaveText('—N/D')
  await expect(page.getByRole('table')).not.toContainText('Invalid Date')
})

test('lista de teams: documento com updated_at null mostra "—"', async ({ page }) => {
  await page.goto('/teams')

  const row = page.getByRole('row', { name: /Time Config/ })
  await expect(row).toBeVisible()
  await expect(row.locator('time')).toHaveCount(0)
  await expect(row).toContainText('—')
})
