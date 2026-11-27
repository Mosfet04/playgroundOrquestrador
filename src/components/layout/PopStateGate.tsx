'use client'

import { useEffect } from 'react'

// Quem segura o Voltar/Avançar do browser agora (o DraftGuard com o formulário aberto).
let gate: ((event: PopStateEvent) => void) | null = null

// Liga o handler; a função devolvida o desliga se ele ainda for o atual.
export function holdPopState(handler: (event: PopStateEvent) => void) {
  gate = handler
  return () => {
    if (gate === handler) gate = null
  }
}

/**
 * Listener de popstate à frente do App Router (QA1-06). O router registra o
 * dele num efeito ao montar e, no popstate, troca a página. Na `window` a
 * captura não passa na frente de um listener registrado antes (Chromium): vale
 * a ordem de registro. O efeito deste componente, descendente do router no
 * layout raiz (que nunca desmonta, nem depois do login), roda antes do efeito
 * dele; o `gate` pode parar o evento (`stopImmediatePropagation`).
 */
export function PopStateGate() {
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => gate?.(event)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
  return null
}
