// Períodos do filtro, com granularidade de dia (decisão 0023); valem para todos
// os cards. Uma lista só, do cliente e do BFF.
export const DASHBOARD_PERIODS = ['today', '7d', '30d', '90d'] as const
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number]

export interface DashboardStats {
  // Estatísticas gerais
  activeAgents: number
  totalAgents: number
  // Pico diário de usuários no período (decisão 0023)
  peakDailyUsers: number
  totalSessions: number
  totalAgentSessions: number
  totalTeamSessions: number
  totalTokens: number

  // Modelos utilizados
  models: ModelUsage[]
  embeddingModels: ModelUsage[]

  // Atividade ao longo do tempo
  activityOverTime: ActivityPoint[]
}

export interface ModelUsage {
  name: string
  provider: string
  count: number
}

export interface ActivityPoint {
  time: string
  sessions: number
  agentSessions?: number
  teamSessions?: number
}
