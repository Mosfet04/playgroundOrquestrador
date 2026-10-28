import { getConfigSchema } from '@/server/orchestrator/schema'

import { ok, orchestratorError } from '../../respond'

export const runtime = 'nodejs'

// P3-01: opções dos formulários (providers, métodos HTTP, tipos de parâmetro)
// e se a config aceita escrita, lidas do /admin/schema. Sessão exigida pelo
// middleware; a falha devolve só o código.
export async function GET() {
  const result = await getConfigSchema()
  return result.ok ? ok(result.data) : orchestratorError(result.error)
}
