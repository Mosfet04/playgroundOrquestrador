import { getRuntimeRevision } from '@/server/orchestrator/health'

import { ok, orchestratorError } from '../../respond'

export const runtime = 'nodejs'

// P4-01: revisão do runtime em vigor, para o indicador da casca. Sessão
// exigida pelo middleware; a falha devolve só o código (src/server/orchestrator).
export async function GET() {
  const result = await getRuntimeRevision()
  return result.ok
    ? ok({ revision: result.data.runtime_revision })
    : orchestratorError(result.error)
}
