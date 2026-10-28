import { NextResponse } from 'next/server'

import { getOrchestratorHealth } from '@/server/orchestrator/health'

// P2-02: o orquestrador está no ar e aceita a chave do BFF. Sessão exigida
// pelo middleware; a falha devolve só o código (src/server/orchestrator).
export async function GET() {
  const result = await getOrchestratorHealth()
  if (!result.ok)
    return NextResponse.json({ success: false, error: result.error }, { status: 503 })
  return NextResponse.json({ success: true, data: result.data })
}
