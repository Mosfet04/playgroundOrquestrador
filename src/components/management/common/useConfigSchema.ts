import { useCallback, useEffect, useState } from 'react'

import type { ConfigSchema } from '@/types/management'

type SchemaState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; schema: ConfigSchema }

// Opções dos formulários de agent e tool (P3-01): uma leitura do
// GET /api/config/schema por abertura, sem cache. `reload` refaz a leitura
// depois de uma falha.
export function useConfigSchema() {
  const [state, setState] = useState<SchemaState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  // "Tentar de novo" em curso: o estado de erro fica até a resposta chegar.
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/config/schema', { signal: controller.signal })
      .then(async (response) => {
        const body = response.ok ? await response.json() : null
        setState(
          body?.success
            ? { status: 'ready', schema: body.data as ConfigSchema }
            : { status: 'error' }
        )
        setRetrying(false)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        console.error('Error loading config schema:', error)
        setState({ status: 'error' })
        setRetrying(false)
      })
    return () => controller.abort()
  }, [attempt])

  const reload = useCallback(() => {
    setRetrying(true)
    setAttempt((count) => count + 1)
  }, [])

  return { state, retrying, reload }
}

// O valor gravado que o orquestrador não oferece mais (provider retirado) segue
// na lista, para continuar selecionado e visível.
export const withCurrent = (options: string[], current: string | undefined) =>
  current && !options.includes(current) ? [...options, current] : options
