import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { focusHeadingIfLost } from '@/components/ui/loading'

// Aviso do formulário sobre o /admin/schema (P3-01): falha ao carregar (com
// "Tentar de novo") ou config só leitura. Na tentativa o botão fica
// `aria-disabled` com "Tentando…" (sem `disabled`, o foco não se perde); deu
// certo, o aviso some e o foco vai ao título (padrão do LoadErrorState).
export function ConfigSchemaNotice({
  status,
  writable,
  retrying,
  onRetry
}: {
  status: 'loading' | 'error' | 'ready'
  writable: boolean
  retrying: boolean
  onRetry: () => void
}) {
  const t = useTranslations('common')
  const retried = useRef(false)

  useEffect(() => {
    if (status === 'ready' && retried.current) {
      retried.current = false
      focusHeadingIfLost()
    }
  }, [status])

  if (status === 'error')
    return (
      <div
        role="alert"
        className="flex flex-col gap-3 rounded-lg border border-destructive/50 p-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"
      >
        <p>{t('schemaLoadError')}</p>
        <Button
          type="button"
          variant="outline"
          aria-disabled={retrying || undefined}
          className="aria-disabled:opacity-50"
          onClick={() => {
            if (retrying) return
            retried.current = true
            onRetry()
          }}
        >
          {retrying ? t('retrying') : t('retry')}
        </Button>
      </div>
    )
  if (status === 'ready' && !writable)
    return (
      <p role="status" className="rounded-lg border border-border bg-muted p-4 text-sm">
        {t('schemaReadOnly')}
      </p>
    )
  return null
}
