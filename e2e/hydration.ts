import { expect, type Page } from '@playwright/test'

// Um clique antes da hidratação se perde (o Select do Radix e os handlers
// ainda não existem). O botão de tema nasce desabilitado e só habilita ao
// montar: serve de sinal de página hidratada. Use depois de `goto`/`goBack`/
// `reload` e antes da primeira interação.
export const hydrated = (page: Page) =>
  expect(page.getByRole('combobox', { name: /Alterar tema|Change theme/ })).toBeEnabled()
