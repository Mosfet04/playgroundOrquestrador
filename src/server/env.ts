import 'server-only'

import { z } from 'zod'

// Formato do `pnpm auth:hash` (scripts/auth-hash.mts, decisão 0017).
export const PASSWORD_HASH_FORMAT = /^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/

const serverEnvSchema = z.object({
  ORCHESTRATOR_URL: z.url({ protocol: /^https?$/ }),
  ORCHESTRATOR_API_KEY_RUN: z.string().min(1),
  ORCHESTRATOR_API_KEY_ADMIN: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  AUTH_USERNAME: z.string().min(1),
  AUTH_PASSWORD_HASH: z.string().regex(PASSWORD_HASH_FORMAT)
})

export type ServerEnv = z.infer<typeof serverEnvSchema>

// O erro cita só o nome de cada variável (ausente ou inválida), nunca o valor.
export function parseServerEnv(
  source: Record<string, string | undefined>
): ServerEnv {
  const result = serverEnvSchema.safeParse(source)
  if (result.success) return result.data
  const problems = result.error.issues.map((issue) => {
    const name = String(issue.path[0])
    return `${name} (${source[name] === undefined ? 'ausente' : 'inválida'})`
  })
  throw new Error(
    `Env do servidor incompleto: ${problems.join(', ')}. Veja "Variáveis de ambiente" no README.`
  )
}

// Lido a cada chamada (barato), com os nomes explícitos: o middleware roda no
// edge, que só expõe o process.env por chave.
export function getServerEnv(): ServerEnv {
  return parseServerEnv({
    ORCHESTRATOR_URL: process.env.ORCHESTRATOR_URL,
    ORCHESTRATOR_API_KEY_RUN: process.env.ORCHESTRATOR_API_KEY_RUN,
    ORCHESTRATOR_API_KEY_ADMIN: process.env.ORCHESTRATOR_API_KEY_ADMIN,
    SESSION_SECRET: process.env.SESSION_SECRET,
    AUTH_USERNAME: process.env.AUTH_USERNAME,
    AUTH_PASSWORD_HASH: process.env.AUTH_PASSWORD_HASH
  })
}
