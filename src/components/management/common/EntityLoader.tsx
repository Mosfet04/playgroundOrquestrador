'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CircleAlert } from 'lucide-react'

import { usePageLabel } from '@/components/layout/AppShell'
import { LoadingSpinner } from '@/components/ui/loading'
import { cn, focusRing } from '@/lib/utils'

type LoadState<T> =
  | { status: 'loading' }
  | { status: 'ready'; entity: T }
  | { status: 'error'; code?: number }

export type EntityLoaderTexts = {
  loading: string
  notFound: string
  loadError: string
  back: string
  backHref: string
}

// Detalhe de agente/tool (P1-03): spinner com aria-busy até o GET do BFF
// responder; 404 ou outro erro viram um bloco role="alert" com o id e o link
// de volta. O P1-05 troca isso pelo padrão de erro/404.
export function EntityLoader<T>({
  url,
  id,
  texts,
  getLabel,
  children
}: {
  url: string
  id: string
  texts: EntityLoaderTexts
  getLabel: (entity: T) => string
  children: (entity: T) => React.ReactNode
}) {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' })

  useEffect(() => {
    let current = true
    setState({ status: 'loading' })
    const load = async () => {
      try {
        const response = await fetch(url)
        const body = response.ok ? await response.json() : null
        if (!current) return
        setState(
          body?.success
            ? { status: 'ready', entity: body.data as T }
            : { status: 'error', code: response.status }
        )
      } catch (error) {
        console.error('Error loading entity:', url, error)
        if (current) setState({ status: 'error' })
      }
    }
    load()
    return () => {
      current = false
    }
  }, [url])

  usePageLabel(state.status === 'ready' ? getLabel(state.entity) : undefined)

  if (state.status === 'loading')
    return (
      <div aria-busy="true">
        <LoadingSpinner text={texts.loading} />
      </div>
    )

  if (state.status === 'ready') return children(state.entity)

  return (
    <div
      role="alert"
      className="mx-auto flex max-w-md flex-col items-center gap-3 p-8 text-center"
    >
      <CircleAlert aria-hidden="true" className="size-8 text-destructive" />
      <h1 className="text-base font-semibold">
        {state.code === 404 ? texts.notFound : texts.loadError}
      </h1>
      <p className="break-all font-mono text-sm text-muted-foreground">{id}</p>
      {state.code && state.code !== 404 && (
        <p className="text-sm text-muted-foreground">código {state.code}</p>
      )}
      <Link
        href={texts.backHref}
        className={cn(
          'rounded-sm text-sm font-medium text-primary hover:underline',
          focusRing
        )}
      >
        {texts.back}
      </Link>
    </div>
  )
}
