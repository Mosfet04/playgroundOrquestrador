import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { listSessions } from '@/server/orchestrator/chat'

import {
  badRequest,
  idSchema,
  kindSchema,
  ok,
  orchestratorError
} from '../respond'

export const runtime = 'nodejs'

const querySchema = z.object({ type: kindSchema, component_id: idSchema })

// P2-03: sessões do agente ou team (?type=&component_id=).
export async function GET(request: NextRequest) {
  const query = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  )
  if (!query.success) return badRequest()
  const result = await listSessions(query.data.type, query.data.component_id)
  return result.ok ? ok(result.data) : orchestratorError(result.error)
}
