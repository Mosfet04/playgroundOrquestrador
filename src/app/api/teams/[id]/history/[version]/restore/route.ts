import { restoreTeam } from '@/server/orchestrator/teams'

import { restoreRoute } from '../../../../../history'

export const runtime = 'nodejs'

// P4-04: volta o team ao documento da versão, com a versão lida no If-Match.
export const POST = restoreRoute(restoreTeam)
