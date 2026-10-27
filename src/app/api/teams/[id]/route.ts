import type { NextRequest } from 'next/server'

import { deleteTeam, getTeam, replaceTeam } from '@/server/orchestrator/teams'

import { parseJsonBody } from '../../parseJsonBody'
import {
  badRequest,
  configError,
  idSchema,
  ifMatchVersion,
  ok,
  orchestratorError
} from '../../respond'
import { teamUpdateSchema } from '../schema'

export const runtime = 'nodejs'

type Context = { params: Promise<{ id: string }> }

// O route handler já recebe o param decodificado (Next 15.2; só as páginas o
// recebem codificado): decodificar de novo trocaria `a%41` por `aA`.
const routeId = async ({ params }: Context) => idSchema.safeParse((await params).id)

// P3-04: detalhe, troca e exclusão pela API Admin (chave admin). PUT e DELETE
// levam a versão lida no If-Match.
export async function GET(_request: NextRequest, context: Context) {
  const id = await routeId(context)
  if (!id.success) return badRequest()
  const result = await getTeam(id.data)
  return result.ok ? ok(result.data) : orchestratorError(result.error)
}

export async function PUT(request: NextRequest, context: Context) {
  const id = await routeId(context)
  const version = ifMatchVersion(request)
  if (!id.success || version === null) return badRequest()
  const parsed = await parseJsonBody(request, teamUpdateSchema)
  if (!parsed.success) return parsed.response
  const result = await replaceTeam(id.data, parsed.data, version)
  return result.ok ? ok(result.data) : configError(result)
}

export async function DELETE(request: NextRequest, context: Context) {
  const id = await routeId(context)
  const version = ifMatchVersion(request)
  if (!id.success || version === null) return badRequest()
  const result = await deleteTeam(id.data, version)
  return result.ok ? ok() : configError(result)
}
