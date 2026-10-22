// @vitest-environment node
import { SignJWT } from 'jose'
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { POST as login } from '@/app/api/auth/login/route'
import { POST as logout } from '@/app/api/auth/logout/route'
import { safeNextPath } from '@/lib/safeNext'
import { middleware } from '@/middleware'
import { SESSION_COOKIE, createSession, verifySession } from '@/server/session'

import { TEST_ENV, TEST_USER } from '../../e2e/test-env'

// QA P2-01: lacunas de segurança que os testes do dev não cobrem (algoritmo
// do JWT, vazamento de segredo nas respostas, limites de entrada, métodos
// seguros sem sessão, matcher, env quebrado no middleware).

afterEach(() => {
  vi.unstubAllEnvs()
})

const key = new TextEncoder().encode(TEST_ENV.SESSION_SECRET)
const b64 = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString('base64url')

describe('QA sessão: algoritmo e forja', () => {
  it('recusa HS512 assinado com o mesmo segredo (algoritmo fixo em HS256)', async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS512' })
      .setSubject('playground')
      .setExpirationTime('1h')
      .sign(key)

    expect(await verifySession(token)).toBeNull()
  })

  it('recusa token sem assinatura (alg none)', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'playground', exp })}.`

    expect(await verifySession(token)).toBeNull()
  })

  it('recusa token com 2 partes, com 4 partes e com cabeçalho lixo', async () => {
    const [h, p, s] = (await createSession('playground')).split('.')

    for (const token of [`${h}.${p}`, `${h}.${p}.${s}.${s}`, `@@@.${p}.${s}`]) {
      expect(await verifySession(token)).toBeNull()
    }
  })
})

function loginRequest(body: unknown, ip: string, raw?: string) {
  return new NextRequest('http://playground.test/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: raw ?? JSON.stringify(body)
  })
}
let ip = 0
const nextIp = () => `172.16.0.${++ip}`

describe('QA login: respostas e limites de entrada', () => {
  it('nenhuma resposta (200, 400, 401) carrega hash, segredo ou chave do env', async () => {
    const responses = [
      await login(loginRequest(TEST_USER, nextIp())),
      await login(loginRequest({ ...TEST_USER, password: 'x' }, nextIp())),
      await login(loginRequest({ username: 1 }, nextIp())),
      await login(loginRequest(null, nextIp(), '{'))
    ]
    const blockedIp = nextIp()
    for (let i = 0; i < 6; i++) {
      responses.push(
        await login(loginRequest({ ...TEST_USER, password: 'x' }, blockedIp))
      )
    }

    expect(responses.map((r) => r.status)).toContain(429)
    for (const response of responses) {
      const text = `${await response.text()} ${[...response.headers].join(' ')}`
      // O Set-Cookie do 200 leva o JWT (assinado, sem o segredo): só ele é permitido.
      const withoutSession = text.replace(/session=[^;\s]+/g, '')
      for (const value of Object.values(TEST_ENV)) {
        expect(withoutSession).not.toContain(value)
      }
      expect(withoutSession).not.toMatch(/scrypt:|e2e-segredo/)
    }
  })

  it('senha de 1024 caracteres é conferida (401); acima disso, 400 sem gastar tentativa', async () => {
    const atLimit = await login(
      loginRequest({ ...TEST_USER, password: 'a'.repeat(1024) }, nextIp())
    )
    const longUser = await login(
      loginRequest({ ...TEST_USER, username: 'u'.repeat(257) }, nextIp())
    )
    const addr = nextIp()
    for (let i = 0; i < 6; i++) {
      const over = await login(
        loginRequest({ ...TEST_USER, password: 'a'.repeat(1025) }, addr)
      )
      expect(over.status).toBe(400)
    }

    expect(atLimit.status).toBe(401)
    expect(longUser.status).toBe(400)
    expect((await login(loginRequest(TEST_USER, addr))).status).toBe(200)
  })

  it.each([
    ['usuário como operador', { username: { $gt: '' }, password: 'x' }],
    ['senha como array', { username: 'playground', password: ['x'] }],
    ['corpo array', [TEST_USER]],
    ['corpo null', null],
    ['campos vazios', { username: '', password: '' }]
  ])('%s: 400 e nenhum cookie', async (_, body) => {
    const response = await login(loginRequest(body, nextIp()))

    expect(response.status).toBe(400)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(await response.text()).not.toMatch(/\$gt|playground/)
  })

  it('campos extras são ignorados: o cookie leva só o usuário da env', async () => {
    const response = await login(
      loginRequest({ ...TEST_USER, sub: 'admin', role: 'admin' }, nextIp())
    )
    const token = response.headers
      .get('set-cookie')
      ?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1]

    expect(response.status).toBe(200)
    expect(await verifySession(token ?? '')).toEqual({
      username: TEST_USER.username
    })
  })

  it('login certo zera o contador: 4 falhas + sucesso + 4 falhas não bloqueiam', async () => {
    const addr = nextIp()
    const wrong = { ...TEST_USER, password: 'x' }
    for (let i = 0; i < 4; i++) await login(loginRequest(wrong, addr))
    expect((await login(loginRequest(TEST_USER, addr))).status).toBe(200)
    for (let i = 0; i < 4; i++) {
      expect((await login(loginRequest(wrong, addr))).status).toBe(401)
    }
  })

  it('logout responde só { success: true } e expira o cookie', async () => {
    const response = await logout()

    expect(await response.json()).toEqual({ success: true })
    expect(response.headers.get('set-cookie')).toMatch(
      new RegExp(`^${SESSION_COOKIE}=;.*Expires=Thu, 01 Jan 1970`, 'i')
    )
  })
})

function req(path: string, init: { method?: string; cookie?: string } = {}) {
  const headers = new Headers({ host: 'playground.test' })
  if (init.cookie !== undefined)
    headers.set('cookie', `${SESSION_COOKIE}=${init.cookie}`)
  return new NextRequest(`http://playground.test${path}`, {
    method: init.method ?? 'GET',
    headers
  })
}

describe('QA middleware', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])(
    '%s em /api sem sessão: 401 (método seguro dispensa Origin, não a sessão)',
    async (method) => {
      const response = await middleware(req('/api/agents', { method }))

      expect(response.status).toBe(401)
    }
  )

  it('/api e /api/ sem sessão: 401', async () => {
    expect((await middleware(req('/api'))).status).toBe(401)
    expect((await middleware(req('/api/'))).status).toBe(401)
  })

  it('reason=expired forjado na URL não vira cookie vencido', async () => {
    const response = await middleware(req('/agents?reason=expired'))

    const login = new URL(response.headers.get('location') ?? '')
    expect(login.searchParams.get('reason')).toBeNull()
    expect(login.searchParams.get('next')).toBe('/agents?reason=expired')
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('caminho com // inicial sem sessão: o next vai codificado e a página o neutraliza', async () => {
    const response = await middleware(req('//evil.example/x'))

    const login = new URL(response.headers.get('location') ?? '')
    expect(login.host).toBe('playground.test')
    expect(safeNextPath(login.searchParams.get('next'))).toBe('/')
  })

  it('env quebrado: o middleware lança, não finge sessão expirada nem apaga o cookie', async () => {
    const cookie = await createSession('playground')
    vi.stubEnv('SESSION_SECRET', 'curto')

    await expect(
      middleware(req('/agents', { cookie }))
    ).rejects.toThrow(/SESSION_SECRET/)
  })
})

describe('QA safeNext: resultado lido como o navegador lê', () => {
  it.each([
    '//evil.com',
    '/%09/evil.com',
    '/\r/evil.com',
    '/\u0000/evil.com',
    '/%5Cevil.com',
    '/..//evil.com',
    '/a/%2e%2e/%2e%2e//evil.com',
    '/?x=1//evil.com',
    '/#//evil.com',
    'data:text/html,<script>',
    'HTTP://evil.com',
    '/。/evil.com'
  ])('%j nunca sai do host do app', (input) => {
    const result = safeNextPath(input)

    expect(result.startsWith('//')).toBe(false)
    expect(new URL(result, 'http://app.test').origin).toBe('http://app.test')
  })
})
