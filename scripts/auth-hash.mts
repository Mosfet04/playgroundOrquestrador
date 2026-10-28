// Gera o AUTH_PASSWORD_HASH do login (decisão 0017, D-P2-01-3): scrypt do
// node:crypto, no formato `scrypt:<sal hex>:<chave hex>` que
// src/server/password.ts confere. A senha vem do stdin, nunca de argv (não
// fica no histórico do shell nem na lista de processos).
//   read -rs PW && printf '%s' "$PW" | pnpm -s auth:hash; unset PW
import { randomBytes, scryptSync } from 'node:crypto'

const chunks: Buffer[] = []
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
const password = Buffer.concat(chunks)
  .toString('utf8')
  .replace(/\r?\n$/, '')

if (password === '') {
  console.error('Senha vazia: passe a senha pelo stdin.')
  process.exit(1)
}

const salt = randomBytes(16)
const key = scryptSync(password, salt, 64)
console.log(`scrypt:${salt.toString('hex')}:${key.toString('hex')}`)
