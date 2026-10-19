import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'

// Tradução lida na hora do toast, fora das deps dos callbacks de carga: o `t`
// muda na troca de idioma e, nas deps, refaria a carga do playground (status,
// agentes e sessões) a cada troca (P1-04b).
export function usePlaygroundTranslationsRef() {
  const t = useTranslations('playground')
  const ref = useRef(t)
  useEffect(() => {
    ref.current = t
  }, [t])
  return ref
}
