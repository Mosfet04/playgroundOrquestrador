import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { createTeam, listTeams } from '@/server/orchestrator/teams'

import { parseJsonBody } from '../parseJsonBody'
import { badRequest, configError, ok, orchestratorError } from '../respond'
import { teamBodySchema } from './schema'

export const runtime = 'nodejs'

// A API Admin não filtra nem busca: o BFF lê a lista inteira e filtra.
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  active: z.enum(['true', 'false']).optional()
})

// P3-04: lista de teams pela API Admin do orquestrador (chave admin).
export async function GET(request: NextRequest) {
  const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!query.success) return badRequest()
  const { page, limit, search, active } = query.data
  const result = await listTeams(
    { search, active: active === undefined ? undefined : active === 'true' },
    page,
    limit
  )
  return result.ok ? ok(result.data) : orchestratorError(result.error)
}

export async function POST(request: NextRequest) {
  const parsed = await parseJsonBody(request, teamBodySchema)
  if (!parsed.success) return parsed.response
  const result = await createTeam(parsed.data)
  return result.ok ? ok(result.data) : configError(result)
}
