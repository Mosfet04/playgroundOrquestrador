import 'server-only'

import { createHash, scrypt, timingSafeEqual } from 'node:crypto'

import { PASSWORD_HASH_FORMAT, type ServerEnv } from './env'

const derive = (password: string, salt: Buffer, length: number) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, length, (error, key) =>
      error ? reject(error) : resolve(key)
    )
  })

// Confere a senha com o hash `scrypt:<sal>:<chave>` do `pnpm auth:hash`.
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  if (!PASSWORD_HASH_FORMAT.test(storedHash)) return false
  const [, saltHex, keyHex] = storedHash.split(':')
  const expected = Buffer.from(keyHex, 'hex')
  const actual = await derive(
    password,
    Buffer.from(saltHex, 'hex'),
    expected.length
  )
  return timingSafeEqual(actual, expected)
}

// Tempo constante para textos de tamanhos diferentes: compara os digests.
const sameText = (a: string, b: string) =>
  timingSafeEqual(
    createHash('sha256').update(a).digest(),
    createHash('sha256').update(b).digest()
  )

// O scrypt roda mesmo com o usuário errado: o tempo não revela qual campo errou.
export async function verifyCredentials(
  username: string,
  password: string,
  env: Pick<ServerEnv, 'AUTH_USERNAME' | 'AUTH_PASSWORD_HASH'>
): Promise<boolean> {
  const passwordOk = await verifyPassword(password, env.AUTH_PASSWORD_HASH)
  return sameText(username, env.AUTH_USERNAME) && passwordOk
}
