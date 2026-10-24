import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { badRequest, ok, orchestratorError } from '@/app/api/respond'
import { getDashboardStats } from '@/server/orchestrator/dashboard'
import { DASHBOARD_PERIODS } from '@/types/dashboard'

export const runtime = 'nodejs'

// Sem `period` vale o dia de hoje; valor fora da lista é 400.
const querySchema = z.object({
  period: z.enum(DASHBOARD_PERIODS).default('today')
})

// P2-05: números do dashboard pelo orquestrador (chave admin, sem Mongo).
export async function GET(request: NextRequest) {
  const query = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  )
  if (!query.success) return badRequest()
  const result = await getDashboardStats(query.data.period)
  return result.ok ? ok(result.data) : orchestratorError(result.error)
}
