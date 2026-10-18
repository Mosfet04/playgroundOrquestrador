'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, RefreshCw, Unplug } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableCell, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

// Estados do Design System (docs/design/P1-05.md): carregando, vazio, vazio do
// filtro, erro e não encontrado.

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  text: string
}

export function LoadingSpinner({ size = 'md', text }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8', 
    lg: 'w-12 h-12'
  }

  return (
    <div className="flex flex-col items-center justify-center p-8">
      <div className={`animate-spin border-4 border-primary border-t-transparent rounded-full ${sizeClasses[size]} mb-4`}></div>
      <p className="text-muted-foreground">{text}</p>
    </div>
  )
}

// Foco perdido (o elemento focado desmontou): vai para o h1 da página, já o
// do conteúdo novo quando chamado no cleanup de um efeito (P1-05, P1-05b).
export function focusHeadingIfLost() {
  const active = document.activeElement
  if (!active || active === document.body) document.querySelector<HTMLElement>('h1')?.focus()
}

/** Texto `role="status"` com o ponto `signal` ao vivo. */
export function LiveStatus({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="inline-flex items-center gap-2 font-mono text-xs font-medium text-signal"
    >
      <span aria-hidden="true" className="live-dot size-2 shrink-0 rounded-full bg-current" />
      {children}
    </p>
  )
}

/**
 * Skeleton da lista com o texto de carregando: a partir de md, o cabeçalho
 * real da tabela (`head`) e 3 linhas; abaixo, 3 linhas de 64 px.
 */
export function ListSkeleton({
  label,
  head,
  chipClassName
}: {
  label: string
  head: ReactNode
  /** Largura do chip da 2ª coluna (modelo ou requisição). */
  chipClassName: string
}) {
  const rows = [0, 1, 2]
  return (
    <div aria-busy="true" className="space-y-4">
      <LiveStatus>{label}</LiveStatus>
      <div className="hidden md:block">
        <Table>
          <thead>{head}</thead>
          <tbody>
            {rows.map((key) => (
              <TableRow key={key}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-7 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-2/3" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Skeleton className={cn('h-6', chipClassName)} />
                </TableCell>
                <TableCell>
                  <Skeleton className="ml-auto h-3 w-6" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-6 w-16" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-3 w-20" />
                </TableCell>
                <TableCell />
              </TableRow>
            ))}
          </tbody>
        </Table>
      </div>
      <div className="divide-y divide-border rounded-lg border border-border bg-card md:hidden">
        {rows.map((key) => (
          <div key={key} className="flex h-16 items-center gap-3 px-3">
            <Skeleton className="size-7 shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md border border-border bg-muted px-2 font-mono text-xs text-foreground',
        className
      )}
    >
      {children}
    </span>
  )
}

// Ilustração de nós do vazio: nó central com o gradiente da marca.
function NodesIllustration() {
  const gradient = `nodes-${useId().replace(/:/g, '')}`
  return (
    <svg
      viewBox="0 0 200 96"
      aria-hidden="true"
      className="h-24 w-48"
      style={{ filter: 'drop-shadow(0 0 14px hsl(var(--primary) / 0.4))' }}
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'hsl(var(--primary))' }} />
          <stop offset="1" style={{ stopColor: 'hsl(var(--signal))' }} />
        </linearGradient>
      </defs>
      <path className="fill-none stroke-primary" strokeWidth="1.5" d="M100 48 L40 20" />
      <g className="fill-none stroke-input" strokeWidth="1.5" strokeDasharray="4 4">
        <path d="M100 48 L160 20" />
        <path d="M100 48 L40 76" />
        <path d="M100 48 L160 76" />
      </g>
      <g className="fill-card stroke-input" strokeWidth="1.5">
        <circle cx="40" cy="20" r="8" />
        <circle cx="160" cy="20" r="8" />
        <circle cx="40" cy="76" r="8" />
        <circle cx="160" cy="76" r="8" />
      </g>
      <rect x="84" y="32" width="32" height="32" rx="6" fill={`url(#${gradient})`} />
    </svg>
  )
}

type EmptyStateProps = {
  title: ReactNode
  titleAs?: 'h1' | 'h2' | 'h3'
  description?: ReactNode
  /** Linha em mono abaixo do título (id, endpoint). */
  detail?: ReactNode
  /** Com ícone, é o bloco de erro/não encontrado; sem, o vazio com a ilustração. */
  icon?: ReactNode
  /** Acima do título (chip 404). */
  eyebrow?: ReactNode
  chips?: ReactNode
  actions?: ReactNode
  role?: 'alert'
  className?: string
}

export function EmptyState({
  title,
  titleAs: Title = 'h2',
  description,
  detail,
  icon,
  eyebrow,
  chips,
  actions,
  role,
  className
}: EmptyStateProps) {
  const descriptionEl = description && (
    <p className="max-w-[60ch] text-sm text-muted-foreground">{description}</p>
  )
  if (!icon)
    return (
      <div
        role={role}
        className={cn(
          'dot-grid flex flex-col items-center gap-2 rounded-lg border border-border bg-card px-6 py-12 text-center',
          className
        )}
      >
        <NodesIllustration />
        <Title className="text-lg font-semibold">{title}</Title>
        {descriptionEl}
        {actions && (
          <div className="mt-2 flex w-full flex-col justify-center gap-2 sm:w-auto sm:flex-row [&>*]:h-10">
            {actions}
          </div>
        )}
      </div>
    )
  return (
    <div
      role={role}
      className={cn(
        'flex flex-col items-start gap-3 rounded-lg border border-border bg-card px-4 py-6 sm:flex-row sm:gap-4 sm:px-6 sm:py-8',
        className
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted [&_svg]:size-5"
      >
        {icon}
      </span>
      <div className="flex w-full min-w-0 flex-1 flex-col items-start gap-2">
        {eyebrow}
        <Title className={cn('font-semibold', Title === 'h1' ? 'text-lg' : 'text-base')}>
          {title}
        </Title>
        {detail && (
          <span className="break-all font-mono text-sm text-muted-foreground">{detail}</span>
        )}
        {descriptionEl}
        {chips && <div className="mt-2 flex flex-wrap gap-2">{chips}</div>}
        {actions && (
          <div className="mt-2 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap [&>*]:h-10">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}

/** Vazio do filtro: card compacto em linha com "Limpar filtros". */
export function FilterEmptyState({
  title,
  hint,
  action
}: {
  title: ReactNode
  hint: string
  action: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card px-6 py-5 sm:flex-row sm:items-center sm:justify-between [&>button]:h-10">
      <div className="space-y-0.5">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      {action}
    </div>
  )
}

/**
 * Bloco de erro de carga: título da área, dica, chip ("offline" sem resposta;
 * "código {n}" com status, V-P1-05-1/16) e "Tentar de novo", que refaz só a
 * busca da área. Na tentativa o botão fica `aria-disabled` com "Tentando…"
 * (sem `disabled`, o foco não se perde); deu certo (`onRetry` devolve true),
 * o foco vai para o h1 da página. O sucesso desmonta o bloco: o foco sai no
 * cleanup do efeito, depois do commit, quando o h1 do conteúdo novo já existe
 * (no Next o render do update roda numa tarefa depois do await).
 */
export function LoadErrorState({
  title,
  titleAs,
  status,
  detail,
  onRetry,
  extraAction,
  className
}: {
  title: string
  titleAs?: 'h1' | 'h2' | 'h3'
  status?: number
  detail?: ReactNode
  onRetry: () => Promise<boolean>
  extraAction?: ReactNode
  className?: string
}) {
  const t = useTranslations('common')
  const [retrying, setRetrying] = useState(false)
  // O bloco pode desmontar antes ou depois de `onRetry` resolver: vale
  // tentativa em curso ou já com sucesso. Só move o foco se ele se perdeu com
  // o botão; desmontar porque o usuário digitou na busca não tira o foco dele.
  const pending = useRef(false)
  const succeeded = useRef(false)

  useEffect(
    () => () => {
      if (pending.current || succeeded.current) focusHeadingIfLost()
    },
    []
  )

  const retry = async () => {
    if (retrying) return
    setRetrying(true)
    pending.current = true
    try {
      succeeded.current = await onRetry()
    } finally {
      pending.current = false
      setRetrying(false)
    }
  }

  return (
    <EmptyState
      role="alert"
      icon={<Unplug className="text-destructive" />}
      title={title}
      titleAs={titleAs}
      detail={detail}
      description={t('loadErrorHint')}
      chips={
        status === undefined ? (
          <Chip className="text-destructive">
            <span aria-hidden="true" className="size-2 rounded-full bg-current" />
            {t('offline')}
          </Chip>
        ) : (
          <Chip>{t('code', { status })}</Chip>
        )
      }
      actions={
        <>
          <Button
            variant="outline"
            aria-disabled={retrying || undefined}
            onClick={retry}
            className="w-full aria-disabled:opacity-50 sm:w-auto"
          >
            {retrying ? (
              <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />
            ) : (
              <RefreshCw aria-hidden="true" />
            )}
            {retrying ? t('retrying') : t('retry')}
          </Button>
          {extraAction}
        </>
      }
      className={className}
    />
  )
}
