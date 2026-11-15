import { teamHistory } from '@/server/orchestrator/teams'

import { historyRoute } from '../../../history'

export const runtime = 'nodejs'

// P4-04: histórico paginado do team (?offset=&limit=, mais nova primeiro).
export const GET = historyRoute(teamHistory)
