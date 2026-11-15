import { getRuntimeHealth } from '@/server/orchestrator/health'

import { ok, orchestratorError } from '../../respond'

export const runtime = 'nodejs'

// Saúde do orquestrador e revisão do runtime (P4-01, P4-05): a leitura única
// da casca, que o indicador e a /settings compartilham. Degradado é 200 com
// `status: 'degraded'` (D-P4-05-8). Sessão exigida pelo middleware; a falha
// devolve só o código (src/server/orchestrator).
export async function GET() {
  const result = await getRuntimeHealth()
  return result.ok ? ok(result.data) : orchestratorError(result.error)
}
