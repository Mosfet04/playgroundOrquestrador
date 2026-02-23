import { NextRequest, NextResponse } from 'next/server'
import { connectToMongoDB, storageCollection } from '@/lib/mongodb'

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

    // Agrupar por agente ou team
    const entityMetrics = new Map()
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sessions.forEach((session: any) => {
      const isTeam = session.session_type === 'team'
      const entityId = isTeam ? session.team_id : session.agent_id
      const entityData = isTeam ? session.team_data : session.agent_data
      const entityName = entityData?.name || entityId || 'unknown'
      
      if (!entityId) return // skip sessions without an entity identifier
      
      if (!entityMetrics.has(entityId)) {
        entityMetrics.set(entityId, {
          agentId: entityId,
          agentName: entityName,
          entityType: isTeam ? 'team' : 'agent',
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          sessions: 0
        })
      }
      
      const metrics = entityMetrics.get(entityId)
      metrics.sessions += 1
      
      // v2.5: tokens nas session_metrics
      if (session.session_data?.session_metrics) {
        const sessionMetrics = session.session_data.session_metrics
        metrics.inputTokens += sessionMetrics.input_tokens || 0
        metrics.outputTokens += sessionMetrics.output_tokens || 0
        metrics.totalTokens += sessionMetrics.total_tokens || 0
      }
      
      // Fallback: somar tokens das runs individuais (v2.5 usa runs direto, não memory.runs)
      const runs = session.runs || session.memory?.runs
      if (runs && Array.isArray(runs) && !session.session_data?.session_metrics?.total_tokens) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        runs.forEach((run: any) => {
          if (run.metrics) {
            // v2.5: metrics.input_tokens é número direto
            // legado: metrics.input_tokens pode ser array
            const inputTokens = Array.isArray(run.metrics.input_tokens)
              ? (run.metrics.input_tokens[0] || 0)
              : (run.metrics.input_tokens || 0)
            const outputTokens = Array.isArray(run.metrics.output_tokens)
              ? (run.metrics.output_tokens[0] || 0)
              : (run.metrics.output_tokens || 0)
            
            metrics.inputTokens += inputTokens
            metrics.outputTokens += outputTokens
            metrics.totalTokens += (inputTokens + outputTokens)
          }
        })
      }
    })

    const tokenMetrics = Array.from(entityMetrics.values())
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
