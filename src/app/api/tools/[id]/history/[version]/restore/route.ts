import { restoreTool } from '@/server/orchestrator/tools'

import { restoreRoute } from '../../../../../history'

export const runtime = 'nodejs'

// P4-04: volta o tool ao documento da versão, com a versão lida no If-Match.
export const POST = restoreRoute(restoreTool)
