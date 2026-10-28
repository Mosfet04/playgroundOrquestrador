import 'server-only'

import { z } from 'zod'

import type { DashboardPeriod, DashboardStats, ModelUsage } from '@/types/dashboard'

import { listConfigs } from './adminConfig'
import { callOrchestrator, type OrchestratorResult } from './client'
import type { components } from './openapi'

// Dashboard pelo orquestrador (P2-05, decisão 0023): agregados por dia do
// GET /metrics do AgentOS e a config dos agents da API Admin (chave admin nas
// duas). Os dias do período somam; só "usuários" é o pico diário. O GET /metrics
// só lê agregados prontos: o recálculo é o POST /metrics/refresh (decisão 0023,
// D-P2-05-5).

type Schemas = components['schemas']

const PERIOD_DAYS: Record<DashboardPeriod, number> = {
  today: 1,
  '7d': 7,
  '30d': 30,
  '90d': 90
}
const DAY_MS = 24 * 60 * 60 * 1000

// Dias do AgentOS são UTC (`date` em T00:00:00Z): o período conta o dia de
// hoje e os anteriores, em UTC.
const startingDate = (period: DashboardPeriod, now: Date) =>
  new Date(now.getTime() - (PERIOD_DAYS[period] - 1) * DAY_MS)
    .toISOString()
    .slice(0, 10)

// `token_metrics` e `model_metrics` são objetos abertos no contrato: só os
// campos usados, tolerando ausentes.
const metricsSchema = z.object({
  metrics: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
      agent_sessions_count: z.number(),
      team_sessions_count: z.number(),
      users_count: z.number(),
      token_metrics: z.object({ total_tokens: z.number().nullish() }),
      model_metrics: z.array(
        z.object({
          model_id: z.string().nullish(),
          model_provider: z.string().nullish(),
          count: z.number().nullish()
        })
      )
    })
  )
}) satisfies z.ZodType<{
  metrics: Pick<
    Schemas['DayAggregatedMetrics'],
    | 'date'
    | 'agent_sessions_count'
    | 'team_sessions_count'
    | 'users_count'
    | 'token_metrics'
    | 'model_metrics'
  >[]
}>

// Config dos agents pela API Admin (lista inteira, inativos inclusive: o
// DELETE lógico é `active: false`); só os campos usados.
const agentConfigSchema = z.object({
  active: z.boolean().nullish(),
  rag_config: z
    .object({
      active: z.boolean().nullish(),
      model: z.string().nullish(),
      factory_ia_model: z.string().nullish()
    })
    .nullish()
})

// No máximo 1 recálculo por minuto por processo (marca em memória): o refresh
// é idempotente (upsert por data) mas custa uma varredura no orquestrador. Quem
// chega dentro do minuto espera o refresh em curso, se houver, para ler depois
// dele. Falha ou prazo estourado (3 s, menor que o padrão: o refresh só adianta
// os números) não impedem a leitura; o cliente já loga a falha.
const REFRESH_INTERVAL_MS = 60_000
const REFRESH_TIMEOUT_MS = 3000
let lastRefreshAt = Number.NEGATIVE_INFINITY
let refreshing: Promise<void> | undefined

async function refreshMetrics(now: Date) {
  if (now.getTime() - lastRefreshAt < REFRESH_INTERVAL_MS)
    return await refreshing
  lastRefreshAt = now.getTime()
  refreshing = callOrchestrator('/metrics/refresh', {
    key: 'admin',
    method: 'POST',
    schema: z.unknown(),
    timeoutMs: REFRESH_TIMEOUT_MS
  })
    .then(() => undefined)
    .finally(() => {
      refreshing = undefined
    })
  return await refreshing
}

const sortByCount = (usage: Map<string, ModelUsage>) =>
  [...usage.values()].sort((a, b) => b.count - a.count)

function addUsage(
  usage: Map<string, ModelUsage>,
  name: string,
  provider: string,
  count: number
) {
  const key = `${name}|${provider}`
  usage.set(key, { name, provider, count: (usage.get(key)?.count ?? 0) + count })
}

export async function getDashboardStats(
  period: DashboardPeriod,
  now = new Date()
): Promise<OrchestratorResult<DashboardStats>> {
  const [metrics, configs] = await Promise.all([
    refreshMetrics(now).then(() =>
      callOrchestrator('/metrics', {
        key: 'admin',
        schema: metricsSchema,
        query: { starting_date: startingDate(period, now) }
      })
    ),
    listConfigs('agents', agentConfigSchema)
  ])
  if (!metrics.ok) return metrics
  if (!configs.ok) return configs

  const days = metrics.data.metrics
  const models = new Map<string, ModelUsage>()
  for (const day of days)
    for (const model of day.model_metrics)
      if (model.model_id)
        addUsage(models, model.model_id, model.model_provider ?? '', model.count ?? 0)

  // Embedding: o RAG ativo da config do agent ativo (uso = agents que o usam).
  const embeddingModels = new Map<string, ModelUsage>()
  for (const agent of configs.data.items) {
    const rag = agent.rag_config
    if (agent.active && rag?.active && rag.model && rag.factory_ia_model)
      addUsage(embeddingModels, rag.model, rag.factory_ia_model, 1)
  }

  const sum = (pick: (day: (typeof days)[number]) => number) =>
    days.reduce((total, day) => total + pick(day), 0)
  const totalAgentSessions = sum((day) => day.agent_sessions_count)
  const totalTeamSessions = sum((day) => day.team_sessions_count)

  return {
    ok: true,
    data: {
      activeAgents: configs.data.items.filter((agent) => agent.active).length,
      totalAgents: configs.data.total,
      peakDailyUsers: Math.max(0, ...days.map((day) => day.users_count)),
      totalSessions: totalAgentSessions + totalTeamSessions,
      totalAgentSessions,
      totalTeamSessions,
      totalTokens: sum((day) => day.token_metrics.total_tokens ?? 0),
      models: sortByCount(models),
      embeddingModels: sortByCount(embeddingModels),
      activityOverTime: days
        .map((day) => ({
          time: day.date.slice(0, 10),
          sessions: day.agent_sessions_count + day.team_sessions_count,
          agentSessions: day.agent_sessions_count,
          teamSessions: day.team_sessions_count
        }))
        .sort((a, b) => a.time.localeCompare(b.time))
    }
  }
}
