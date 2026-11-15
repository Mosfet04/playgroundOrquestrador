'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { CircleCheck, CircleMinus, CircleX, TriangleAlert, type LucideIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { focusHeadingIfLost } from '@/components/ui/loading'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// Peças da /settings (P4-05 §3–§5): seção em card com título e o que vai ao
// lado dele, esqueleto, erro de leitura, badge e faixa de status por tom.

export type Tone = 'success' | 'warning' | 'neutral' | 'destructive'

const TONE_ICON: Record<Tone, LucideIcon> = {
  success: CircleCheck,
  warning: TriangleAlert,
  neutral: CircleMinus,
  destructive: CircleX
}

/** Card com `h2`, nomeado por ele (região); `aside` fica à direita do título e quebra linha. */
export function SettingsSection({
  title,
  aside,
  busy,
  children
}: {
  title: string
  aside?: ReactNode
  busy?: boolean
  children: ReactNode
}) {
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      aria-busy={busy || undefined}
      className="rounded-lg border border-border bg-card text-card-foreground"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h2 id={id} className="mr-auto text-base font-semibold">
          {title}
        </h2>
        {aside}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

export function SectionSkeleton() {
  return (
    <div className="space-y-2.5">
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-4" />
      <Skeleton className="h-4" />
    </div>
  )
}

/**
 * Leitura da seção que falhou (§4): mensagem, código e "Tentar de novo", que
 * fica `aria-disabled` com "Tentando…" na tentativa (o foco não se perde).
 * Deu certo, o bloco some e o foco vai ao `h1` (padrão do LoadErrorState).
 */
export function SectionError({
  message,
  code,
  retrying,
  onRetry
}: {
  message: string
  code: string
  retrying: boolean
  onRetry: () => void
}) {
  const tc = useTranslations('common')
  const retried = useRef(false)

  useEffect(
    () => () => {
      if (retried.current) focusHeadingIfLost()
    },
    []
  )

  return (
    <div role="alert" className="flex flex-col items-start gap-2">
      <StatusNote tone="destructive">{message}</StatusNote>
      <span className="font-mono text-xs text-muted-foreground">{code}</span>
      <Button
        variant="outline"
        aria-disabled={retrying || undefined}
        className="h-11 aria-disabled:opacity-50 sm:h-9"
        onClick={() => {
          if (retrying) return
          retried.current = true
          onRetry()
        }}
      >
        {retrying ? tc('retrying') : tc('retry')}
      </Button>
    </div>
  )
}

/** Badge com ícone e palavra no tom do status (nunca só cor). */
export function ToneBadge({
  tone,
  icon: Icon = TONE_ICON[tone],
  children
}: {
  tone: Tone
  icon?: LucideIcon
  children: ReactNode
}) {
  return (
    <Badge variant={tone}>
      <Icon aria-hidden="true" className="size-3" />
      {children}
    </Badge>
  )
}

const NOTE_BORDER: Record<Exclude<Tone, 'neutral'>, string> = {
  success: 'border-success',
  warning: 'border-warning',
  destructive: 'border-destructive text-destructive'
}
const NOTE_ICON: Record<Exclude<Tone, 'neutral'>, string> = {
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive'
}

/** Faixa de status (degradado, desfecho da recarga, erro de leitura). */
export function StatusNote({
  tone,
  role,
  className,
  children
}: {
  tone: Exclude<Tone, 'neutral'>
  role?: 'status' | 'alert'
  className?: string
  children: ReactNode
}) {
  const Icon = TONE_ICON[tone]
  return (
    <p
      role={role}
      className={cn(
        'flex w-full items-start gap-2 rounded-md border bg-muted px-3 py-2.5 text-sm',
        NOTE_BORDER[tone],
        className
      )}
    >
      <Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', NOTE_ICON[tone])} />
      <span>{children}</span>
    </p>
  )
}
