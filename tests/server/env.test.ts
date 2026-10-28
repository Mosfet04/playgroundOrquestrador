// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getServerEnv, parseServerEnv } from '@/server/env'

import { TEST_ENV } from '../../e2e/test-env'

// P2-01: env do servidor validado com zod; faltando ou inválido, o erro cita
// só os nomes, nunca os valores.

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('parseServerEnv', () => {
  it('aceita o env completo', () => {
    expect(parseServerEnv(TEST_ENV)).toEqual(TEST_ENV)
  })

  it('cita as variáveis ausentes', () => {
    const partial = {
      ...TEST_ENV,
      SESSION_SECRET: undefined,
      AUTH_PASSWORD_HASH: undefined
    }

    expect(() => parseServerEnv(partial)).toThrow(
      /SESSION_SECRET \(ausente\).*AUTH_PASSWORD_HASH \(ausente\)/
    )
  })

  it.each([
    ['ORCHESTRATOR_URL', 'ftp://segredo-na-url.example'],
    ['SESSION_SECRET', 'segredo-curto'],
    ['AUTH_PASSWORD_HASH', 'senha-em-claro-vazada'],
    ['ORCHESTRATOR_API_KEY_RUN', '']
  ])('recusa %s inválido sem ecoar o valor', (name, value) => {
    const run = () => parseServerEnv({ ...TEST_ENV, [name]: value })

    expect(run).toThrow(name)
    try {
      run()
    } catch (error) {
      const message = (error as Error).message
      if (value) expect(message).not.toContain(value)
      for (const secret of Object.values(TEST_ENV))
        expect(message).not.toContain(secret)
    }
  })
})

describe('getServerEnv', () => {
  it('lê o process.env a cada chamada', () => {
    expect(getServerEnv().AUTH_USERNAME).toBe(TEST_ENV.AUTH_USERNAME)

    vi.stubEnv('AUTH_USERNAME', 'outro')
    expect(getServerEnv().AUTH_USERNAME).toBe('outro')
  })
})

describe('instrumentation (boot)', () => {
  it('falha no boot do Node com o env incompleto, sem ecoar valores', async () => {
    const { register } = await import('@/instrumentation')
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    vi.stubEnv('SESSION_SECRET', undefined)

    await expect(register()).rejects.toThrow(/SESSION_SECRET \(ausente\)/)
  })

  it('passa com o env completo', async () => {
    const { register } = await import('@/instrumentation')
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')

    await expect(register()).resolves.toBeUndefined()
  })
})
