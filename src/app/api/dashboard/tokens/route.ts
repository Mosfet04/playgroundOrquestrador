import { NextRequest, NextResponse } from 'next/server'
import { connectToMongoDB, storageCollection, agentsCollection } from '@/lib/mongodb'

export async function GET(request: NextRequest) {
  try {
    await connectToMongoDB()
    
    const { searchParams } = new URL(request.url)
    const timeFilter = searchParams.get('timeFilter') || '24h'
    
    // Calcular timestamp baseado no filtro
    let timeThreshold: number
    const now = Date.now()
    
    switch (timeFilter) {
      case '1h':
        timeThreshold = now - (1 * 60 * 60 * 1000)
        break
      case '24h':
        timeThreshold = now - (24 * 60 * 60 * 1000)
        break
      case '7d':
        timeThreshold = now - (7 * 24 * 60 * 60 * 1000)
        break
      case '30d':
        timeThreshold = now - (30 * 24 * 60 * 60 * 1000)
        break
      case '90d':
        timeThreshold = now - (90 * 24 * 60 * 60 * 1000)
        break
      default:
        timeThreshold = now - (24 * 60 * 60 * 1000)
    }

    // Buscar sessões no período
    const sessions = await storageCollection.find({
      created_at: { $gte: Math.floor(timeThreshold / 1000) }
    }).toArray()

    // Agrupar por agente
    const agentMetrics = new Map()
    
    sessions.forEach((session: any) => {
      const agentId = session.agent_id
      const agentName = session.agent_data?.name || agentId
      
      if (!agentMetrics.has(agentId)) {
        agentMetrics.set(agentId, {
          agentId,
          agentName,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          sessions: 0
        })
      }
      
      const metrics = agentMetrics.get(agentId)
      metrics.sessions += 1
      
      // Somar tokens das runs
      if (session.memory?.runs) {
        session.memory.runs.forEach((run: any) => {
          if (run.metrics) {
            const inputTokens = run.metrics.input_tokens?.[0] || 0
            const outputTokens = run.metrics.output_tokens?.[0] || 0
            
            metrics.inputTokens += inputTokens
            metrics.outputTokens += outputTokens
            metrics.totalTokens += (inputTokens + outputTokens)
          }
        })
      }
      
      // Também verificar session_metrics
      if (session.session_data?.session_metrics) {
        const sessionMetrics = session.session_data.session_metrics
        metrics.inputTokens += sessionMetrics.input_tokens || 0
        metrics.outputTokens += sessionMetrics.output_tokens || 0
        metrics.totalTokens += sessionMetrics.total_tokens || 0
      }
    })

    const tokenMetrics = Array.from(agentMetrics.values())
      .sort((a, b) => b.totalTokens - a.totalTokens)

    return NextResponse.json({
      success: true,
      data: tokenMetrics
    })
  } catch (error) {
    console.error('Error fetching token metrics:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Erro interno do servidor' 
      },
      { status: 500 }
    )
  }
}
