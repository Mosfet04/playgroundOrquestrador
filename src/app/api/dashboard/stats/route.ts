import { NextRequest, NextResponse } from 'next/server'
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

    // Estatísticas de sessões
    const totalSessions = await storageCollection.countDocuments()
    
    // Estatísticas de tokens (últimas 24h)
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recentSessions = await storageCollection.find({
      created_at: { $gte: Math.floor(last24h.getTime() / 1000) }
    }).toArray()

    const sessionsInPeriod = recentSessions.length
    
    let totalTokens = 0
    recentSessions.forEach((session: any) => {
      if (session.session_data?.session_metrics?.total_tokens) {
        totalTokens += session.session_data.session_metrics.total_tokens
      }
    })

    // Modelos utilizados
    const agentsWithModels = await agentsCollection.find({ active: true }).toArray()
    const modelUsage = new Map()
    const embeddingModelUsage = new Map()

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

    // Atividade ao longo do tempo (últimos 7 dias) - versão simplificada
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const recentSessionsForActivity = await storageCollection.find({
      created_at: { $gte: Math.floor(last7Days.getTime() / 1000) }
    }).toArray()

    // Agrupar por dia manualmente
    const activityMap = new Map()
    recentSessionsForActivity.forEach((session: any) => {
      const date = new Date(session.created_at * 1000)
      const dateKey = date.toISOString().split('T')[0] // YYYY-MM-DD
      activityMap.set(dateKey, (activityMap.get(dateKey) || 0) + 1)
    })

    const activityOverTime = Array.from(activityMap.entries()).map(([time, sessions]) => ({
      time,
      sessions
    })).sort((a, b) => a.time.localeCompare(b.time))

    const stats = {
      activeAgents,
      totalAgents,
      uniqueUsers,
      totalSessions,
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
