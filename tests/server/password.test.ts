// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

import { verifyCredentials, verifyPassword } from '@/server/password'

import { TEST_ENV, TEST_USER } from '../../e2e/test-env'

// P2-01 (D-P2-01-3): hash scrypt na env, gerado por `pnpm auth:hash` (senha
// pelo stdin), conferido em tempo constante.

const hashFromScript = (input: string) =>
  execFileSync(process.execPath, ['scripts/auth-hash.mts'], {
    input,
    encoding: 'utf8'
  }).trim()

describe('verifyPassword', () => {
  it('confere o hash gerado pelo auth:hash (com ou sem quebra de linha final)', async () => {
    const hash = hashFromScript('correta horse\n')

    expect(hash).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/)
    expect(await verifyPassword('correta horse', hash)).toBe(true)
    expect(await verifyPassword('correta horse\n', hash)).toBe(false)
    expect(await verifyPassword('Correta horse', hash)).toBe(false)
  })

  it('o auth:hash recusa senha vazia', () => {
    expect(() => hashFromScript('')).toThrow()
  })

  it('hash fora do formato não confere', async () => {
    expect(await verifyPassword('x', 'scrypt:zz:zz')).toBe(false)
  })
})

describe('verifyCredentials', () => {
  it.each([
    [TEST_USER.username, TEST_USER.password, true],
    [TEST_USER.username, 'errada', false],
    ['outro', TEST_USER.password, false],
    [`${TEST_USER.username} `, TEST_USER.password, false],
    ['', '', false]
  ])('%j / %j -> %s', async (username, password, expected) => {
    expect(await verifyCredentials(username, password, TEST_ENV)).toBe(expected)
  })
})
