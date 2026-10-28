// @vitest-environment node
import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { POST as login } from '@/app/api/auth/login/route'
import { POST as logout } from '@/app/api/auth/logout/route'
import { SESSION_COOKIE, verifySession } from '@/server/session'
import { LOGIN_MAX_ATTEMPTS } from '@/server/rateLimit'

import { TEST_USER } from '../../../e2e/test-env'

// P2-01: POST /api/auth/login (usuário + senha, erro genérico, 429 depois de
// N falhas) e POST /api/auth/logout. O Origin é do middleware.

let ipCounter = 0
const nextIp = () => `10.0.0.${++ipCounter}`

function loginRequest(body: unknown, ip: string) {
  return new NextRequest('http://playground.test/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  })
}

const sessionToken = (response: Response) =>
  response.headers
    .get('set-cookie')
    ?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1]

describe('POST /api/auth/login', () => {
  it('credencial certa: 200 e cookie de sessão httpOnly, Lax, 12 h, com o usuário', async () => {
    const response = await login(loginRequest(TEST_USER, nextIp()))

    expect(response.status).toBe(200)
    const cookie = response.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=lax/i)
    expect(cookie).toMatch(/Max-Age=43200/)
    expect(cookie).toMatch(/Path=\//)
    expect(await verifySession(sessionToken(response) ?? '')).toEqual({
      username: TEST_USER.username
    })
  })

  it.each([
    ['senha errada', { ...TEST_USER, password: 'errada' }],
    ['usuário errado', { ...TEST_USER, username: 'outro' }]
  ])('%s: 401 com mensagem genérica, sem cookie', async (_, body) => {
    const response = await login(loginRequest(body, nextIp()))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      success: false,
      error: 'invalid_credentials'
    })
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it.each([
    ['JSON malformado', '{"username":'],
    ['sem senha', { username: 'playground' }],
    [
      'operador no lugar da senha',
      { username: 'playground', password: { $ne: '' } }
    ]
  ])('%s: 400 sem ecoar o corpo', async (_, body) => {
    const response = await login(loginRequest(body, nextIp()))

    expect(response.status).toBe(400)
    expect(await response.text()).not.toContain('$ne')
  })

  it(`depois de ${LOGIN_MAX_ATTEMPTS} falhas do mesmo IP: 429 com Retry-After, até com a senha certa`, async () => {
    const ip = nextIp()
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      expect(
        (await login(loginRequest({ ...TEST_USER, password: 'x' }, ip))).status
      ).toBe(401)
    }

    const blocked = await login(loginRequest(TEST_USER, ip))
    const otherIp = await login(loginRequest(TEST_USER, nextIp()))

    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(await blocked.json()).toEqual({
      success: false,
      error: 'too_many_attempts'
    })
    expect(blocked.headers.get('set-cookie')).toBeNull()
    expect(otherIp.status).toBe(200)
  })

  // R2 da review: a tentativa é reservada antes do scrypt; uma rajada
  // concorrente não passa de N conferências.
  it('rajada concorrente: só N tentativas são conferidas, o resto é 429', async () => {
    const ip = nextIp()
    const extra = 7
    const statuses = await Promise.all(
      Array.from({ length: LOGIN_MAX_ATTEMPTS + extra }, (_, i) =>
        login(loginRequest({ ...TEST_USER, password: `errada-${i}` }, ip)).then(
          (response) => response.status
        )
      )
    )

    expect(statuses.filter((status) => status === 401)).toHaveLength(
      LOGIN_MAX_ATTEMPTS
    )
    expect(statuses.filter((status) => status === 429)).toHaveLength(extra)
  })

  it('corpo inválido (400) não gasta tentativa', async () => {
    const ip = nextIp()
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS + 2; i++) {
      expect((await login(loginRequest('{', ip))).status).toBe(400)
    }

    expect((await login(loginRequest(TEST_USER, ip))).status).toBe(200)
  })

  // R3 da review: X-Forwarded-For que não é IP não vira chave própria (nem
  // do tamanho do header): cai no balde "unknown".
  it('X-Forwarded-For que não é IP conta no mesmo balde', async () => {
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      await login(
        loginRequest(
          { ...TEST_USER, password: 'x' },
          `lixo-${i}-${'a'.repeat(500)}`
        )
      )
    }

    expect((await login(loginRequest(TEST_USER, 'outro-lixo'))).status).toBe(
      429
    )
  })

  it('o IP é o último do X-Forwarded-For (o que o proxy viu)', async () => {
    const ip = nextIp()
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      await login(
        loginRequest({ ...TEST_USER, password: 'x' }, `forjado-${i}, ${ip}`)
      )
    }

    expect((await login(loginRequest(TEST_USER, ip))).status).toBe(429)
  })
})

describe('POST /api/auth/logout', () => {
  it('apaga o cookie de sessão', async () => {
    const response = await logout()

    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toMatch(
      new RegExp(
        `^${SESSION_COOKIE}=;.*(Max-Age=0|Expires=Thu, 01 Jan 1970)`,
        'i'
      )
    )
  })
})
