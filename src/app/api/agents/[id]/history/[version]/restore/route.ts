import { restoreAgent } from '@/server/orchestrator/agents'

import { restoreRoute } from '../../../../../history'

export const runtime = 'nodejs'

// P4-04: volta o agent ao documento da versão, com a versão lida no If-Match.
export const POST = restoreRoute(restoreAgent)
