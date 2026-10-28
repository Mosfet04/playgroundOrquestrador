import { randomBytes } from 'node:crypto'

import { expect, request as playwrightRequest, test } from '@playwright/test'

import { APP_URL } from '../playwright.config'
import { hydrated } from './hydration'
import { TEST_ENV, TEST_USER } from './test-env'

// QA P2-01. Complementa e2e/auth.spec.ts contra o app real: cookie visto pelo
// browser, limite de tentativas na cadeia completa, assets públicos do login,
// idioma na tela de login, usuário logado em /login e Origin no logout.
// O limite é por IP e todos os logins do e2e vêm do mesmo IP: os testes que
// gastam tentativas usam um IP próprio no X-Forwarded-For.

const HEADERS = { origin: APP_URL }
const ipHeaders = (ip: string) => ({ ...HEADERS, 'x-forwarded-for': ip })
// IPv6 de documentação (2001:db8::/32) com 64 bits aleatórios: único por
// chamada. O contador vive na memória do servidor, que continua de pé entre
// repetições (--repeat-each) e reexecuções locais; isIP aceita IPv6.
const freshIp = () =>
  `2001:db8:${[...Array(4)]
    .map(() => randomBytes(2).toString('hex'))
    .join(':')}::1`

test('cookie de sessão: httpOnly, Lax, ~12 h e invisível ao JavaScript da página', async ({
  page,
  context
}) => {
  await page.goto('/')
  await expect(page).toHaveURL('/')

  const session = (await context.cookies()).find((c) => c.name === 'session')
  expect(session).toBeDefined()
  expect(session?.httpOnly).toBe(true)
  expect(session?.sameSite).toBe('Lax')
  expect(session?.path).toBe('/')
  const lifetime = (session?.expires ?? 0) - Date.now() / 1000
  expect(lifetime).toBeGreaterThan(11 * 3600)
  expect(lifetime).toBeLessThanOrEqual(12 * 3600 + 5)
  expect(await page.evaluate(() => document.cookie)).not.toContain('session')
})

test('Sair apaga o cookie e uma nova visita a página protegida pede login', async ({
  page,
  context
}) => {
  await page.goto('/agents')
  await hydrated(page)

  await page.getByRole('button', { name: 'Sair' }).click()

  await expect(page).toHaveURL('/login')
  expect((await context.cookies()).some((c) => c.name === 'session')).toBe(false)
  await page.goto('/agents')
  await expect(page).toHaveURL('/login?next=%2Fagents')
})

test('logado, /login leva ao next seguro (ou a /)', async ({ page }) => {
  await page.goto('/login?next=%2Fagents')
  await expect(page).toHaveURL('/agents')

  await page.goto('/login?next=%2F%2Fevil.example')
  await expect(page).toHaveURL('/')
})

test('mutação em /api sem Origin ou de outra origem: 403, mesmo com sessão', async ({
  request
}) => {
  const forbidden: Record<string, string>[] = [
    {},
    { origin: 'http://evil.example' },
    { origin: 'null' }
  ]
  for (const headers of forbidden) {
    const response = await request.post('/api/auth/logout', { headers })
    expect(response.status(), JSON.stringify(headers)).toBe(403)
    expect(await response.json()).toEqual({ success: false, error: 'forbidden_origin' })
  }
  // A sessão segue válida: nada foi apagado.
  expect((await request.get('/', { maxRedirects: 0 })).status()).toBe(200)
})

test.describe('sem sessão', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('assets do Next carregam sem sessão (a tela de login não depende de redirect)', async ({
    page
  }) => {
    const redirected: string[] = []
    page.on('response', (response) => {
      const url = new URL(response.url())
      if (url.pathname.startsWith('/_next/') && [301, 302, 303, 307, 308].includes(response.status())) {
        redirected.push(`${response.status()} ${url.pathname}`)
      }
    })

    await page.goto('/login')
    await hydrated(page)

    expect(redirected).toEqual([])
  })

  test('idioma na tela de login: trocar para English reescreve a tela sem sessão', async ({
    page
  }) => {
    await page.goto('/login')
    await hydrated(page)

    await page.getByRole('combobox', { name: /Alterar idioma/ }).click()
    await page.getByRole('option', { name: 'English' }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
    await expect(page).toHaveURL('/login')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })

  test('429 na cadeia real: 5 falhas, a 6a bloqueia até a senha certa; outro IP entra', async () => {
    const api = await playwrightRequest.newContext({ baseURL: APP_URL })
    try {
      const post = (data: object, ip: string) =>
        api.post('/api/auth/login', { data, headers: ipHeaders(ip) })
      const [blockedIp, otherIp] = [freshIp(), freshIp()]
      const wrong = { ...TEST_USER, password: 'errada' }

      for (let i = 0; i < 5; i++) {
        const response = await post(wrong, blockedIp)
        expect(response.status()).toBe(401)
        expect(await response.json()).toEqual({ success: false, error: 'invalid_credentials' })
      }
      const blocked = await post(TEST_USER, blockedIp)
      expect(blocked.status()).toBe(429)
      expect(Number(blocked.headers()['retry-after'])).toBeGreaterThan(0)
      expect(Number(blocked.headers()['retry-after'])).toBeLessThanOrEqual(900)
      expect(blocked.headers()['set-cookie']).toBeUndefined()

      const other = await post(TEST_USER, otherIp)
      expect(other.status()).toBe(200)
      expect(other.headers()['set-cookie']).toMatch(/session=.*HttpOnly/i)
    } finally {
      await api.dispose()
    }
  })

  test('respostas de login não carregam nenhum valor do env (nem o hash)', async () => {
    const api = await playwrightRequest.newContext({ baseURL: APP_URL })
    try {
      const failure = await api.post('/api/auth/login', {
        data: { ...TEST_USER, password: 'errada' },
        headers: ipHeaders(freshIp())
      })
      const bad = await api.post('/api/auth/login', {
        data: { username: { $ne: '' } },
        headers: ipHeaders(freshIp())
      })

      expect(failure.status()).toBe(401)
      expect(bad.status()).toBe(400)
      for (const response of [failure, bad]) {
        const text = `${await response.text()} ${JSON.stringify(response.headers())}`
        for (const value of Object.values(TEST_ENV)) expect(text).not.toContain(value)
      }
    } finally {
      await api.dispose()
    }
  })

  test('JWT assinado com outro segredo: aviso de sessão expirada e cookie apagado', async ({
    page,
    context
  }) => {
    const { SignJWT } = await import('jose')
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(TEST_USER.username)
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('outro-segredo-com-32-caracteres-ou-mais'))
    await context.addCookies([{ name: 'session', value: forged, url: APP_URL }])

    await page.goto('/tools')

    await expect(page).toHaveURL('/login?next=%2Ftools&reason=expired')
    expect((await context.cookies()).some((c) => c.name === 'session')).toBe(false)
  })
})
