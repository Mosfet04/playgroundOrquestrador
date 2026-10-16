import { expect, test, type Page } from '@playwright/test'

// P1-02: tema claro/escuro/sistema com next-themes. A escolha fica no
// localStorage (`theme`) e volta antes da primeira pintura. Desde a P1-03 o
// seletor é o botão do cabeçalho, nomeado pelo tema atual.

const themeButton = (page: Page) =>
  page.getByRole('combobox', { name: /^Tema: .*\. Alterar tema$/ })

const chooseTheme = async (page: Page, name: string) => {
  await themeButton(page).click()
  await page.getByRole('option', { name }).click()
}

const html = (page: Page) => page.locator('html')

test('tema: a escolha vale na hora e se mantém ao recarregar', async ({
  page
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  const select = themeButton(page)
  await expect(select).toHaveAccessibleName('Tema: Sistema. Alterar tema')
  await expect(html(page)).not.toHaveClass(/\bdark\b/)

  await chooseTheme(page, 'Escuro')
  await expect(html(page)).toHaveClass(/\bdark\b/)

  await page.reload()
  await expect(html(page)).toHaveClass(/\bdark\b/)
  await expect(select).toHaveAccessibleName('Tema: Escuro. Alterar tema')

  await chooseTheme(page, 'Claro')
  await page.reload()
  await expect(html(page)).toHaveClass(/\blight\b/)
  await expect(html(page)).not.toHaveClass(/\bdark\b/)
  await expect(select).toHaveAccessibleName('Tema: Claro. Alterar tema')
})

test('tema: Sistema acompanha o prefers-color-scheme sem recarregar', async ({
  page
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await expect(themeButton(page)).toHaveAccessibleName(
    'Tema: Sistema. Alterar tema'
  )
  await expect(html(page)).toHaveClass(/\blight\b/)

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(html(page)).toHaveClass(/\bdark\b/)
})

test('tema: sem flash nem aviso de hidratação com o tema gravado', async ({
  page
}) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'))

  await page.goto('/', { waitUntil: 'domcontentloaded' })
  // O script do next-themes roda no <head>, antes de qualquer pintura.
  expect(await html(page).getAttribute('class')).toMatch(/\bdark\b/)

  await expect(themeButton(page)).toHaveAccessibleName(
    'Tema: Escuro. Alterar tema'
  )
  expect(consoleErrors.filter((text) => /hydrat/i.test(text))).toEqual([])
})
