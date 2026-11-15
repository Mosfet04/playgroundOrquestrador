import type { Page } from '@playwright/test'

// Salvar numa edição passa pelo diálogo de revisão (P4-02): Salvar + Confirmar.
export async function saveAndConfirm(page: Page) {
  await page.getByRole('button', { name: /^(Salvar|Save)$/ }).click()
  await page
    .getByRole('dialog', { name: /^(Revisar antes de salvar|Review before saving)$/ })
    .getByRole('button', { name: /^(Confirmar e salvar|Confirm and save)$/ })
    .click()
}
