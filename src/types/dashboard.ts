export interface DashboardStats {
  // Estatísticas gerais
  activeAgents: number
  totalAgents: number
  uniqueUsers: number
  totalSessions: number
  sessionsInPeriod: number
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
  tokens?: number
}

export interface TokenMetrics {
  agentId: string
  agentName: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  sessions: number
}

export interface TimeFilter {
  label: string
  value: string
}

export interface UserMetrics {
  userId: string
  sessions: number
  totalTokens: number
  lastActivity: string
}

export interface SessionMetrics {
  sessionId: string
  agentId: string
  agentName: string
  userId: string
  startTime: string
  endTime?: string
  totalTokens: number
  messageCount: number
}

// Filtros para dashboard
export interface DashboardFilters {
  timeRange: string
  agentId?: string
  userId?: string
}
