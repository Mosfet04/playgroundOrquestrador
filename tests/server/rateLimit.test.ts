// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  LOGIN_MAX_ATTEMPTS,
  LOGIN_WINDOW_MS,
  createLoginLimiter
} from '@/server/rateLimit'

// P2-01: rate limit simples, em memória, por IP. Cada tentativa avaliada é
// reservada antes da conferência da senha (R2 da review): depois de N na
// janela, bloqueia com o tempo restante (Retry-After).

const T0 = 1_000_000
const N = LOGIN_MAX_ATTEMPTS

describe('createLoginLimiter', () => {
  it(`libera ${N} tentativas e bloqueia a seguinte com o tempo restante`, () => {
    const limiter = createLoginLimiter()
    for (let i = 0; i < N; i++) expect(limiter.attempt('1.1.1.1', T0)).toBe(0)

    expect(limiter.attempt('1.1.1.1', T0)).toBe(LOGIN_WINDOW_MS / 1000)
    expect(limiter.attempt('1.1.1.1', T0 + LOGIN_WINDOW_MS - 1500)).toBe(2)
  })

  it('libera quando a janela acaba', () => {
    const limiter = createLoginLimiter()
    for (let i = 0; i < N; i++) limiter.attempt('1.1.1.1', T0)

    expect(limiter.attempt('1.1.1.1', T0 + LOGIN_WINDOW_MS)).toBe(0)
  })

  it('conta por IP', () => {
    const limiter = createLoginLimiter()
    for (let i = 0; i < N; i++) limiter.attempt('1.1.1.1', T0)

    expect(limiter.attempt('2.2.2.2', T0)).toBe(0)
  })

  it('login certo zera as tentativas do IP', () => {
    const limiter = createLoginLimiter()
    for (let i = 0; i < N; i++) limiter.attempt('1.1.1.1', T0)
    limiter.reset('1.1.1.1')

    expect(limiter.attempt('1.1.1.1', T0)).toBe(0)
  })

  // R3 da review: o teto de IPs guardados é real; cheio, sai o mais antigo.
  it('com o teto cheio, descarta o IP mais antigo', () => {
    const limiter = createLoginLimiter({ maxTracked: 2 })
    for (let i = 0; i < N; i++) limiter.attempt('1.1.1.1', T0)
    limiter.attempt('2.2.2.2', T0)
    limiter.attempt('3.3.3.3', T0)

    expect(limiter.size()).toBe(2)
    expect(limiter.attempt('1.1.1.1', T0)).toBe(0)
  })
})
