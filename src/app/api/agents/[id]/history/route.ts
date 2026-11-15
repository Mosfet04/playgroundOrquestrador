import { agentHistory } from '@/server/orchestrator/agents'

import { historyRoute } from '../../../history'

export const runtime = 'nodejs'

// P4-04: histórico paginado do agent (?offset=&limit=, mais nova primeiro).
export const GET = historyRoute(agentHistory)
