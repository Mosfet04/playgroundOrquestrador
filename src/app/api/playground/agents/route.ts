import { listEntities } from '@/server/orchestrator/chat'

import { ok, orchestratorError } from '../respond'

export const runtime = 'nodejs'

// P2-03: agents do AgentOS para o seletor do chat (chave run).
export async function GET() {
  const result = await listEntities('agent')
  return result.ok ? ok(result.data) : orchestratorError(result.error)
}
