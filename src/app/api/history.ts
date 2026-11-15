import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { MAX_HISTORY_PAGE, type HistoryPage } from '@/server/orchestrator/adminConfig'
import type { OrchestratorResult } from '@/server/orchestrator/client'

import {
  badRequest,
  configError,
  idSchema,
  ifMatchVersion,
  ok,
  orchestratorError,
  written
} from './respond'

// Histórico e restaurar (P4-04): os mesmos handlers para agents, teams e
// tools, com a função do tipo. O route handler já recebe os params
// decodificados (Next 15.2): decodificar de novo trocaria `a%41` por `aA`.

const DEFAULT_PAGE_SIZE = 20

// Inteiro da query ou do path, só dígitos (sem sinal, ponto, expoente nem espaço).
const digits = (max: number) =>
  z
    .string()
    .regex(/^\d{1,15}$/)
    .transform(Number)
    .pipe(z.number().max(max))

const pageSchema = z.object({
  offset: digits(1_000_000_000).default(0),
  limit: digits(MAX_HISTORY_PAGE).pipe(z.number().min(1)).default(DEFAULT_PAGE_SIZE)
})

type Context = { params: Promise<{ id: string }> }
type VersionContext = { params: Promise<{ id: string; version: string }> }

export const historyRoute =
  <T>(load: (id: string, page: HistoryPage) => Promise<OrchestratorResult<T>>) =>
  async (request: NextRequest, { params }: Context) => {
    const id = idSchema.safeParse((await params).id)
    const page = pageSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
    if (!id.success || !page.success) return badRequest()
    const result = await load(id.data, page.data)
    return result.ok ? ok(result.data) : orchestratorError(result.error)
  }

// POST .../history/{version}/restore com a versão lida no If-Match; a resposta
// é a do PUT (documento novo e revisão do runtime).
export const restoreRoute =
  <T>(restore: (id: string, version: number, current: number) => Promise<OrchestratorResult<T>>) =>
  async (request: NextRequest, { params }: VersionContext) => {
    const { id, version } = await params
    const parsedId = idSchema.safeParse(id)
    const parsedVersion = digits(Number.MAX_SAFE_INTEGER).safeParse(version)
    const current = ifMatchVersion(request)
    if (!parsedId.success || !parsedVersion.success || current === null) return badRequest()
    const result = await restore(parsedId.data, parsedVersion.data, current)
    return result.ok ? written(result) : configError(result)
  }
