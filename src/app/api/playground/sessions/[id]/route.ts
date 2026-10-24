import type { NextRequest } from 'next/server'

import { deleteSession, getSessionHistory } from '@/server/orchestrator/chat'

import {
  badRequest,
  idSchema,
  kindSchema,
  ok,
  orchestratorError
} from '../../respond'

export const runtime = 'nodejs'

type Context = { params: Promise<{ id: string }> }

// P2-03: histórico da sessão (?type=agent|team).
export async function GET(request: NextRequest, { params }: Context) {
  const id = idSchema.safeParse((await params).id)
  const kind = kindSchema.safeParse(request.nextUrl.searchParams.get('type'))
  if (!id.success || !kind.success) return badRequest()
  const result = await getSessionHistory(kind.data, id.data)
  return result.ok ? ok(result.data) : orchestratorError(result.error)
}

// Excluir usa a chave admin (src/server/orchestrator/chat.ts).
export async function DELETE(_request: NextRequest, { params }: Context) {
  const id = idSchema.safeParse((await params).id)
  if (!id.success) return badRequest()
  const result = await deleteSession(id.data)
  return result.ok ? ok() : orchestratorError(result.error)
}
