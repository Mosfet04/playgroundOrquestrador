import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { createTool, listTools } from '@/server/orchestrator/tools'

import { parseJsonBody } from '../parseJsonBody'
import { badRequest, configError, ok, orchestratorError } from '../respond'
import { toolBodySchema } from './schema'

export const runtime = 'nodejs'

// A API Admin não filtra nem busca: o BFF lê a lista inteira e filtra.
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  method: z.string().optional()
})

// P2-06: lista de tools pela API Admin do orquestrador (chave admin).
export async function GET(request: NextRequest) {
  const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!query.success) return badRequest()
  const { page, limit, search, method } = query.data
  const result = await listTools({ search, method }, page, limit)
  return result.ok ? ok(result.data) : orchestratorError(result.error)
}

export async function POST(request: NextRequest) {
  const parsed = await parseJsonBody(request, toolBodySchema)
  if (!parsed.success) return parsed.response
  const result = await createTool(parsed.data)
  return result.ok ? ok(result.data) : configError(result)
}
