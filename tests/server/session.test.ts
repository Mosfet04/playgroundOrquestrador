// @vitest-environment node
import { SignJWT } from 'jose'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSession,
  sessionCookie,
  verifySession
} from '@/server/session'

import { TEST_ENV } from '../../e2e/test-env'

// P2-01 (D-P2-01-3): cookie assinado com jose, expiração absoluta de 12 h.

afterEach(() => {
  vi.useRealTimers()
})

describe('sessão', () => {
  it('assina e verifica, com o usuário no payload', async () => {
    const token = await createSession('playground')

    expect(await verifySession(token)).toEqual({ username: 'playground' })
  })

  it('dura 12 h sem renovação', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-21T08:00:00Z') })
    const token = await createSession('playground')

    vi.setSystemTime(new Date('2026-10-21T19:59:00Z'))
    expect(await verifySession(token)).toEqual({ username: 'playground' })

    vi.setSystemTime(new Date('2026-10-21T20:00:01Z'))
    expect(await verifySession(token)).toBeNull()
  })

  it.each([
    ['vazio', ''],
    ['lixo', 'nao-e-um-jwt'],
    ['outra assinatura', 'troca']
  ])('recusa token %s', async (_, kind) => {
    let token = kind
    if (kind === 'troca') {
      token = await new SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('playground')
        .setExpirationTime('1h')
        .sign(
          new TextEncoder().encode('outro-segredo-com-32-caracteres-ou-mais')
        )
    }

    expect(await verifySession(token)).toBeNull()
  })

  it('recusa token adulterado', async () => {
    const [header, , signature] = (await createSession('playground')).split('.')
    const payload = Buffer.from(
      JSON.stringify({ sub: 'admin', exp: 9999999999 })
    ).toString('base64url')

    expect(await verifySession(`${header}.${payload}.${signature}`)).toBeNull()
  })

  // R4 da review: env quebrado é erro de configuração, não "sem sessão" (que
  // levaria ao aviso de sessão expirada e apagaria o cookie).
  it('com o env inválido, lança em vez de responder "sem sessão"', async () => {
    const token = await createSession('playground')
    vi.stubEnv('SESSION_SECRET', 'curto')

    await expect(verifySession(token)).rejects.toThrow(
      /SESSION_SECRET \(inválida\)/
    )
    vi.unstubAllEnvs()
  })

  it('recusa token sem expiração ou sem usuário', async () => {
    const key = new TextEncoder().encode(TEST_ENV.SESSION_SECRET)
    const noExp = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('playground')
      .sign(key)
    const noSub = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(key)

    expect(await verifySession(noExp)).toBeNull()
    expect(await verifySession(noSub)).toBeNull()
  })

  it('cookie httpOnly, SameSite=Lax, Secure fora de dev e com Max-Age de 12 h', () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(12 * 60 * 60)
    expect(sessionCookie('token')).toEqual({
      name: SESSION_COOKIE,
      value: 'token',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS
    })

    vi.stubEnv('NODE_ENV', 'development')
    expect(sessionCookie('token').secure).toBe(false)
    vi.unstubAllEnvs()
  })
})
