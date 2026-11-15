import { reloadConfig } from '@/server/orchestrator/adminConfig'

import { orchestratorError, written } from '../../respond'

export const runtime = 'nodejs'

// P4-05 (D-P4-05-3/10): relê o store e troca o runtime; devolve a revisão
// nova em `runtimeRevision`, como as escritas. Sem a revisão, 502
// invalid_response; 5xx, 502 not_confirmed. Sessão e Origin exigidos pelo
// middleware.
export async function POST() {
  const result = await reloadConfig()
  return result.ok
    ? written({ runtimeRevision: result.data.runtime_revision })
    : orchestratorError(result.error)
}
