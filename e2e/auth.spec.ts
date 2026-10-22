import { expect, test, type Page } from '@playwright/test'

import { APP_URL } from '../playwright.config'
import { hydrated } from './hydration'
import { TEST_USER } from './test-env'

// P2-01: login, logout e redirect com `next` (docs/design/P2-01.md).

const signIn = async (page: Page, password = TEST_USER.password) => {
  await hydrated(page)
  await page.getByLabel('Usuário').fill(TEST_USER.username)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

test.describe('sem sessão', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('página protegida leva ao login com next e volta a ela depois de entrar (V-P2-01-9)', async ({
    page
  }) => {
    await page.goto('/tools/new?origem=e2e')

    await expect(page).toHaveURL(
      `/login?next=${encodeURIComponent('/tools/new?origem=e2e')}`
    )
    await expect(page).toHaveTitle('Entrar · Playground do Orquestrador')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Entrar' })
    ).toBeVisible()
    await expect(
      page.getByRole('navigation', { name: 'Navegação principal' })
    ).toHaveCount(0)
    await expect(page.getByLabel('Usuário')).toBeFocused()
    // Só `next` (nunca entrou): sem aviso de sessão expirada (V-P2-01-8).
    await expect(page.getByRole('main').getByRole('status')).toHaveCount(0)

    await signIn(page)

    await expect(page).toHaveURL('/tools/new?origem=e2e')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Nova tool' })
    ).toBeVisible()
  })

  for (const next of ['%2F%2Fevil.example', '%2F.%2F%2Fevil.example']) {
    test(`next=${next} (outro site) cai em /`, async ({ page }) => {
      await page.goto(`/login?next=${next}`)
      await signIn(page)

      await expect(page).toHaveURL('/')
    })
  }

  test('senha errada: aviso genérico, senha limpa e com foco (V-P2-01-5)', async ({
    page
  }) => {
    await page.goto('/login')
    await signIn(page, 'senha-errada')

    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Usuário ou senha incorretos.'
    )
    await expect(page.getByLabel('Senha')).toHaveValue('')
    await expect(page.getByLabel('Senha')).toBeFocused()
    await expect(page.getByLabel('Usuário')).toHaveValue(TEST_USER.username)
    await expect(page).toHaveURL('/login')
  })

  test('cookie de sessão inválido: aviso de sessão expirada (V-P2-01-8)', async ({
    page,
    context
  }) => {
    await context.addCookies([
      { name: 'session', value: 'adulterado', url: APP_URL }
    ])
    await page.goto('/agents')

    await expect(page).toHaveURL('/login?next=%2Fagents&reason=expired')
    await expect(page.getByRole('main').getByRole('status')).toContainText(
      'Sua sessão expirou.'
    )
  })

  test('/api sem sessão: 401; mutação de outra origem: 403', async ({
    request
  }) => {
    expect((await request.get('/api/agents')).status()).toBe(401)
    const foreign = await request.post('/api/auth/login', {
      headers: { origin: 'http://evil.example' },
      data: TEST_USER
    })
    expect(foreign.status()).toBe(403)
  })
})

test('Sair leva ao login e o Voltar não reabre a página (V-P2-01-11)', async ({
  page
}) => {
  await page.goto('/tools/new')
  await hydrated(page)

  await page.getByRole('button', { name: 'Sair' }).click()

  await expect(page).toHaveURL('/login')
  await expect(page.getByRole('main').getByRole('status')).toHaveCount(0)

  await page.goBack()
  await expect(page).toHaveURL(
    `/login?next=${encodeURIComponent('/tools/new')}`
  )
  await expect(
    page.getByRole('heading', { level: 1, name: 'Entrar' })
  ).toBeVisible()
})
