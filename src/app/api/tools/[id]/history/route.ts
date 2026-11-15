import { toolHistory } from '@/server/orchestrator/tools'

import { historyRoute } from '../../../history'

export const runtime = 'nodejs'

// P4-04: histórico paginado do tool (?offset=&limit=, mais nova primeiro).
export const GET = historyRoute(toolHistory)
