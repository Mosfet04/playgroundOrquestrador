import { useCallback, useEffect, useState } from 'react'

import type { AgentConfig } from '@/types/management'

export type MemberAgents =
  | { status: 'loading' }
  | { status: 'error' }
  // `total` > `agents.length`: a lista passa do teto da página (100).
  | { status: 'ready'; agents: AgentConfig[]; total: number }

// Agents que o team pode ter como membros (P3-04): os do GET /api/agents, até
// o teto de 100 da página. `reload` refaz a leitura depois de uma falha.
export function useMemberAgents() {
  const [state, setState] = useState<MemberAgents>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/agents?limit=100', { signal: controller.signal })
      .then(async (response) => {
        const body = response.ok ? await response.json() : null
        setState(
          body?.success
            ? { status: 'ready', agents: body.data.data, total: body.data.total }
            : { status: 'error' }
        )
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        console.error('Error loading member agents:', error)
        setState({ status: 'error' })
      })
    return () => controller.abort()
  }, [attempt])

  const reload = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((count) => count + 1)
  }, [])

  return { state, reload }
}
