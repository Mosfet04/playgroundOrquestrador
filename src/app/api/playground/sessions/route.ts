import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { listSessions } from '@/server/orchestrator/chat'

import {
  badRequest,
  idSchema,
  kindSchema,
  ok,
  orchestratorError,
  sessionUser,
  unauthorized
} from '../../respond'

export const runtime = 'nodejs'

const querySchema = z.object({ type: kindSchema, component_id: idSchema })

// P2-03: sessões do agente ou team (?type=&component_id=), só as do usuário
// logado (AG3-02): o user_id vem do cookie, nunca da query.
export async function GET(request: NextRequest) {
  const userId = await sessionUser(request)
  if (!userId) return unauthorized()
  const query = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  )
  if (!query.success) return badRequest()
  const result = await listSessions(
    query.data.type,
    query.data.component_id,
    userId
  )
  return result.ok ? ok(result.data) : orchestratorError(result.error)
}
