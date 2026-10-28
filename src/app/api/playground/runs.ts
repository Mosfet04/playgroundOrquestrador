import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { streamRun, type ChatKind } from '@/server/orchestrator/chat'

import { badRequest, idSchema, orchestratorError, sessionUser } from '../respond'

// Teto da mensagem do chat (texto colado grande cabe; corpo abusivo não).
const MAX_MESSAGE_LENGTH = 32_000
// O route handler do Next 15.2 não limita o corpo: acima disto nem é lido.
const MAX_BODY_BYTES = 256 * 1024

const runBodySchema = z.object({
  message: z.string().min(1).max(MAX_MESSAGE_LENGTH),
  session_id: idSchema.optional()
})

// POST /api/playground/{agents,teams}/[id]/runs: o corpo do orquestrador vai
// direto na resposta (sem buffer); o abort do browser (request.signal) corta
// o fetch ao orquestrador.
export async function postRun(
  request: NextRequest,
  kind: ChatKind,
  params: Promise<{ id: string }>
) {
  const userId = await sessionUser(request)
  if (!userId)
    return NextResponse.json(
      { success: false, error: 'unauthorized' },
      { status: 401 }
    )
  const id = idSchema.safeParse((await params).id)
  if (!id.success) return badRequest()
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES)
    return NextResponse.json(
      { success: false, error: 'payload_too_large' },
      { status: 413 }
    )
  // Corpo inválido tem o mesmo 400 das outras rotas do chat (sem eco).
  const body = runBodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return badRequest()

  const result = await streamRun(
    kind,
    id.data,
    { message: body.data.message, sessionId: body.data.session_id, userId },
    request.signal
  )
  if (!result.ok) return orchestratorError(result.error)
  return new Response(result.data, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no'
    }
  })
}
