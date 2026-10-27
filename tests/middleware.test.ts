// @vitest-environment node
import { SignJWT } from 'jose'
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { middleware } from '@/middleware'
import { SESSION_COOKIE, createSession } from '@/server/session'

import { TEST_ENV } from '../e2e/test-env'

// P2-01: páginas e /api/* só com sessão (redirect / 401), menos /login e
// /api/auth/login; mutação em /api/* só com Origin do próprio host (403).

const HOST = 'playground.test'
const ORIGIN = `http://${HOST}`

function request(
  path: string,
  {
    method = 'GET',
    cookie,
    origin
  }: { method?: string; cookie?: string; origin?: string } = {}
) {
  const headers = new Headers({ host: HOST })
  if (cookie !== undefined) headers.set('cookie', `${SESSION_COOKIE}=${cookie}`)
  if (origin) headers.set('origin', origin)
  return new NextRequest(`${ORIGIN}${path}`, { method, headers })
}

const location = (response: Response) => {
  const url = new URL(response.headers.get('location') ?? '')
  return `${url.pathname}${url.search}`
}

const expiredToken = async () =>
  new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('playground')
    .setIssuedAt(Math.floor(Date.now() / 1000) - 13 * 3600)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
    .sign(new TextEncoder().encode(TEST_ENV.SESSION_SECRET))

const isPassThrough = (response: Response) =>
  response.headers.get('x-middleware-next') === '1'

afterEach(() => {
  vi.useRealTimers()
})

describe('middleware: páginas', () => {
  it('sem cookie redireciona para /login com o next, sem aviso de expirada', async () => {
    const response = await middleware(request('/agents/x?tab=1'))

    expect(response.status).toBe(307)
    expect(location(response)).toBe(
      `/login?next=${encodeURIComponent('/agents/x?tab=1')}`
    )
  })

  it('na raiz, sem next', async () => {
    const response = await middleware(request('/'))

    expect(location(response)).toBe('/login')
  })

  it.each([
    [
      'adulterado',
      async () => `${(await createSession('playground')).slice(0, -2)}xx`
    ],
    ['vencido', expiredToken],
    ['lixo', async () => 'lixo']
  ])(
    'cookie %s: redirect com reason=expired e apaga o cookie',
    async (_, token) => {
      const response = await middleware(
        request('/tools', { cookie: await token() })
      )

      expect(location(response)).toBe('/login?next=%2Ftools&reason=expired')
      expect(response.headers.get('set-cookie')).toMatch(
        new RegExp(`^${SESSION_COOKIE}=;`)
      )
    }
  )

  it('com sessão válida deixa passar', async () => {
    const response = await middleware(
      request('/agents', { cookie: await createSession('playground') })
    )

    expect(isPassThrough(response)).toBe(true)
  })

  it('a sessão vence 12 h depois do login', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-21T08:00:00Z') })
    const cookie = await createSession('playground')
    vi.setSystemTime(new Date('2026-10-21T20:00:01Z'))

    const response = await middleware(request('/agents', { cookie }))

    expect(location(response)).toBe('/login?next=%2Fagents&reason=expired')
  })
})

describe('middleware: /login', () => {
  it('sem sessão abre (GET e o POST da server action de idioma)', async () => {
    expect(
      isPassThrough(await middleware(request('/login?next=/agents')))
    ).toBe(true)
    expect(
      isPassThrough(
        await middleware(request('/login', { method: 'POST', origin: ORIGIN }))
      )
    ).toBe(true)
  })

  it('já logado leva ao next seguro', async () => {
    const cookie = await createSession('playground')

    const toNext = await middleware(
      request('/login?next=%2Fagents', { cookie })
    )
    const toRoot = await middleware(
      request('/login?next=%2F%2Fevil.com', { cookie })
    )

    expect(location(toNext)).toBe('/agents')
    expect(location(toRoot)).toBe('/')
  })

  // R1 (review P2-01): `/.//evil.com` normalizado não pode virar `//evil.com`.
  it.each([
    '%2F.%2F%2Fevil.com',
    '%2Fa%2F..%2F%2Fevil.com',
    '%2F%252e%2F%2Fevil.com'
  ])('já logado, next=%s fica no próprio host', async (next) => {
    const cookie = await createSession('playground')

    const response = await middleware(
      request(`/login?next=${next}`, { cookie })
    )

    expect(new URL(response.headers.get('location') ?? '').host).toBe(HOST)
    expect(location(response)).toBe('/')
  })
})

describe('middleware: /api', () => {
  it('dashboard (P2-05) sem cookie: 401 JSON', async () => {
    const response = await middleware(request('/api/dashboard/stats?period=7d'))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      success: false,
      error: 'unauthorized'
    })
  })

  it('schema dos formulários (P3-01) sem cookie: 401 JSON', async () => {
    const response = await middleware(request('/api/config/schema'))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      success: false,
      error: 'unauthorized'
    })
  })

  it('sem cookie: 401 JSON', async () => {
    const response = await middleware(request('/api/agents'))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      success: false,
      error: 'unauthorized'
    })
  })

  it('cookie vencido ou adulterado: 401', async () => {
    const expired = await middleware(
      request('/api/agents', { cookie: await expiredToken() })
    )
    const forged = await middleware(request('/api/agents', { cookie: 'a.b.c' }))

    expect(expired.status).toBe(401)
    expect(forged.status).toBe(401)
  })

  it('com sessão deixa passar', async () => {
    const response = await middleware(
      request('/api/agents', { cookie: await createSession('playground') })
    )

    expect(isPassThrough(response)).toBe(true)
  })

  it('o login é público (com Origin do host)', async () => {
    const response = await middleware(
      request('/api/auth/login', { method: 'POST', origin: ORIGIN })
    )

    expect(isPassThrough(response)).toBe(true)
  })

  it('o logout exige sessão', async () => {
    const response = await middleware(
      request('/api/auth/logout', { method: 'POST', origin: ORIGIN })
    )

    expect(response.status).toBe(401)
  })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    '%s sem Origin, de outra origem ou com Origin "null": 403, mesmo com sessão',
    async (method) => {
      const cookie = await createSession('playground')
      for (const origin of [
        undefined,
        'http://evil.com',
        'null',
        `http://${HOST}.evil.com`
      ]) {
        const response = await middleware(
          request('/api/agents', { method, cookie, origin })
        )

        expect(response.status, `${method} com Origin ${origin}`).toBe(403)
        expect(await response.json()).toEqual({
          success: false,
          error: 'forbidden_origin'
        })
      }
    }
  )

  // P2-06: o CRUD pela API Admin (PUT/DELETE no item) passa pelas mesmas regras.
  it.each(['/api/agents/assistente', '/api/teams/suporte', '/api/tools/clima'])(
    '%s: PUT/DELETE sem cookie ⇒ 401; com sessão e sem Origin ⇒ 403',
    async (path) => {
      const cookie = await createSession('playground')
      for (const method of ['PUT', 'DELETE']) {
        const anonymous = await middleware(request(path, { method, origin: ORIGIN }))
        const crossSite = await middleware(request(path, { method, cookie }))

        expect(anonymous.status, `${method} sem cookie`).toBe(401)
        expect(crossSite.status, `${method} sem Origin`).toBe(403)
      }
    }
  )

  it('login de outra origem: 403', async () => {
    const response = await middleware(
      request('/api/auth/login', { method: 'POST', origin: 'http://evil.com' })
    )

    expect(response.status).toBe(403)
  })

  it('mutação com Origin do host e sessão passa', async () => {
    const response = await middleware(
      request('/api/agents', {
        method: 'DELETE',
        origin: ORIGIN,
        cookie: await createSession('playground')
      })
    )

    expect(isPassThrough(response)).toBe(true)
  })
})
