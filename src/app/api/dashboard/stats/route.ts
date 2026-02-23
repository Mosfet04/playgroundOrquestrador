import { NextResponse } from 'next/server'
import { connectToMongoDB, agentsCollection, storageCollection } from '@/lib/mongodb'

export async function GET() {
  try {
    await connectToMongoDB()

    // Estatísticas de agentes
    const totalAgents = await agentsCollection.countDocuments()
    const activeAgents = await agentsCollection.countDocuments({ active: true })

    // Estatísticas de usuários únicos
    const uniqueUsersResult = await storageCollection.aggregate([
      { $group: { _id: "$user_id" } },
      { $count: "uniqueUsers" }
    ]).toArray()
    const uniqueUsers = uniqueUsersResult[0]?.uniqueUsers || 0

    // Estatísticas de sessões (agents + teams)
    const totalSessions = await storageCollection.countDocuments()
    const totalAgentSessions = await storageCollection.countDocuments({ session_type: 'agent' })
    const totalTeamSessions = await storageCollection.countDocuments({ session_type: 'team' })
    
    // Estatísticas de tokens (últimas 24h)
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recentSessions = await storageCollection.find({
      created_at: { $gte: Math.floor(last24h.getTime() / 1000) }
    }).toArray()

    const sessionsInPeriod = recentSessions.length
    
    let totalTokens = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recentSessions.forEach((session: any) => {
      // v2.5: session_data.session_metrics tem tokens para agents e teams
      if (session.session_data?.session_metrics?.total_tokens) {
        totalTokens += session.session_data.session_metrics.total_tokens
      }
    })

    // Modelos utilizados
    const agentsWithModels = await agentsCollection.find({ active: true }).toArray()
    const modelUsage = new Map()
    const embeddingModelUsage = new Map()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    agentsWithModels.forEach((agent: any) => {
      // Modelo principal
      if (agent.model && agent.factoryIaModel) {
        const key = `${agent.model}|${agent.factoryIaModel}`
        modelUsage.set(key, {
          name: agent.model,
          provider: agent.factoryIaModel,
          count: (modelUsage.get(key)?.count || 0) + 1
        })
      }

      // Modelo de embedding
      if (agent.rag_config?.active && agent.rag_config?.model && agent.rag_config?.factoryIaModel) {
        const key = `${agent.rag_config.model}|${agent.rag_config.factoryIaModel}`
        embeddingModelUsage.set(key, {
          name: agent.rag_config.model,
          provider: agent.rag_config.factoryIaModel,
          count: (embeddingModelUsage.get(key)?.count || 0) + 1
        })
      }
    })

    // Modelos usados pelos agno sessions (agent_data / team_data)
    const sessionsWithModels = await storageCollection.find({
      $or: [
        { 'agent_data.model': { $exists: true } },
        { 'team_data.model': { $exists: true } }
      ]
    }).toArray()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sessionsWithModels.forEach((session: any) => {
      const data = session.agent_data || session.team_data
      if (data?.model) {
        const modelId = data.model.id || data.model.name || 'unknown'
        const provider = data.model.provider || 'unknown'
        const key = `${modelId}|${provider}`
        if (!modelUsage.has(key)) {
          modelUsage.set(key, {
            name: modelId,
            provider,
            count: 0
          })
        }
        modelUsage.get(key).count += 1
      }
    })

    // Atividade ao longo do tempo (últimos 7 dias) - versão simplificada
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const recentSessionsForActivity = await storageCollection.find({
      created_at: { $gte: Math.floor(last7Days.getTime() / 1000) }
    }).toArray()

    // Agrupar por dia manualmente
    const activityMap = new Map()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recentSessionsForActivity.forEach((session: any) => {
      const date = new Date(session.created_at * 1000)
      const dateKey = date.toISOString().split('T')[0] // YYYY-MM-DD
      const existing = activityMap.get(dateKey) || { sessions: 0, agentSessions: 0, teamSessions: 0 }
      existing.sessions += 1
      if (session.session_type === 'team') {
        existing.teamSessions += 1
      } else {
        existing.agentSessions += 1
      }
      activityMap.set(dateKey, existing)
    })

    const activityOverTime = Array.from(activityMap.entries()).map(([time, data]) => ({
      time,
      sessions: data.sessions,
      agentSessions: data.agentSessions,
      teamSessions: data.teamSessions
    })).sort((a, b) => a.time.localeCompare(b.time))

    const stats = {
      activeAgents,
      totalAgents,
      uniqueUsers,
      totalSessions,
      totalAgentSessions,
      totalTeamSessions,
      sessionsInPeriod,
      totalTokens,
      models: Array.from(modelUsage.values()),
      embeddingModels: Array.from(embeddingModelUsage.values()),
      activityOverTime
    }

    return NextResponse.json({
      success: true,
      data: stats
    })
  } catch (error) {
    console.error('Error fetching dashboard stats:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Erro interno do servidor' 
      },
      { status: 500 }
    )
  }
}
