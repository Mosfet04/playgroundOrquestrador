'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, LogOut } from 'lucide-react'
import { toast } from 'sonner'

import { cn, focusRing } from '@/lib/utils'

// "Sair" (P2-01) com o visual de item da navegação: no fim da navegação
// lateral e no rodapé do Sheet do celular.
export function SignOutButton() {
  const t = useTranslations('auth')
  const [pending, setPending] = useState(false)

  const signOut = async () => {
    if (pending) return
    setPending(true)
    const response = await fetch('/api/auth/logout', { method: 'POST' }).catch(
      () => undefined
    )
    // 401: a sessão já tinha vencido, o resultado é o mesmo.
    if (response?.ok || response?.status === 401) {
      // Navegação completa: zera o store do chat e o cache do router.
      window.location.assign('/login')
      return
    }
    setPending(false)
    toast.error(t('signOutError'), { description: t('signOutErrorHint') })
  }

  return (
    <button
      type="button"
      onClick={signOut}
      aria-busy={pending || undefined}
      aria-disabled={pending || undefined}
      className={cn(
        'flex h-11 w-full items-center gap-3 rounded-md px-3 text-sm text-foreground transition-colors hover:bg-accent aria-disabled:opacity-50 lg:h-9',
        focusRing
      )}
    >
      {pending ? (
        <Loader2
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground motion-safe:animate-spin"
        />
      ) : (
        <LogOut
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
      )}
      {pending ? t('signingOut') : t('signOut')}
    </button>
  )
}
