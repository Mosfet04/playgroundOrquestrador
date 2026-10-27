'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ExternalLink, Search } from 'lucide-react'

import { badgeVariants } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LiveStatus } from '@/components/ui/loading'
import { Skeleton } from '@/components/ui/skeleton'
import type { AgentConfig } from '@/types/management'
import { FieldError } from '../common/FieldError'
import { FieldWarning } from '../common/FieldWarning'
import { OptionCard } from '../common/OptionCard'
import { SectionCard } from '../common/SectionCard'
import type { MemberAgents } from './useMemberAgents'

const ERROR_ID = 'team-members-error'
const SEPARATOR = ' · '

// `id · provider/modelo`, em mono sob o nome.
const agentMeta = (agent: AgentConfig) =>
  [agent.id, `${agent.factoryIaModel}/${agent.model}`].join(SEPARATOR)

const matches = (agent: AgentConfig, query: string) =>
  [agent.nome, agent.id, agent.descricao].some((text) => text?.toLowerCase().includes(query))

// Seção Membros (P3-04): os agents como linhas marcáveis. A ordem gravada se
// mantém e os novos vão para o fim; o id gravado que não está na lista aparece
// no topo, marcado, para o usuário decidir.
export function MembersSection({
  agents,
  selected,
  onChange,
  error,
  locked,
  firstRef,
  groupRef,
  onRetry
}: {
  agents: MemberAgents
  selected: string[]
  onChange: (next: string[]) => void
  error?: string
  /** Store só leitura: marcar fica desabilitado; a busca não é campo do documento. */
  locked: boolean
  firstRef: React.Ref<HTMLInputElement>
  groupRef: React.Ref<HTMLFieldSetElement>
  onRetry: () => void
}) {
  const t = useTranslations('teams.form')
  const tt = useTranslations('teams')
  const tc = useTranslations('common')
  const [query, setQuery] = useState('')

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id])

  const header = {
    id: 'team-members-title',
    title: t('members'),
    description: t('membersDescription')
  }

  if (agents.status === 'loading')
    return (
      <SectionCard {...header} busy>
        <LiveStatus>{t('membersLoading')}</LiveStatus>
        <ul aria-hidden="true" className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[0, 1, 2].map((key) => (
            <li key={key} className="flex gap-3 rounded-lg border border-border p-3">
              <Skeleton className="size-4 shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>
    )

  if (agents.status === 'error')
    return (
      <SectionCard {...header}>
        <div
          role="alert"
          className="space-y-3 rounded-lg border border-destructive/50 p-4 text-sm text-destructive"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>{t('membersLoadError')}</p>
            <Button type="button" variant="outline" onClick={onRetry}>
              {tc('retry')}
            </Button>
          </div>
          <p className="text-muted-foreground">{t('membersSaveBlocked')}</p>
        </div>
      </SectionCard>
    )

  const known = new Set(agents.agents.map(({ id }) => id))
  const missing = selected.filter((id) => !known.has(id))
  const beyondPage = agents.total > agents.agents.length
  const needle = query.trim().toLowerCase()
  const visible = agents.agents
    .map((agent, index) => ({ agent, index }))
    .filter(({ agent }) => !needle || matches(agent, needle))
  const total = agents.agents.length + missing.length

  // O erro fica ligado ao 1º checkbox (alvo do foco local) e ao 1º marcado
  // (alvo do foco do 422), não a todos.
  const firstChecked = visible.find(({ agent }) => selected.includes(agent.id))?.agent.id
  const errorTarget = (id: string, first: boolean) =>
    error && (first || id === firstChecked) ? ERROR_ID : undefined

  const count = (
    <span aria-live="polite" className="whitespace-nowrap font-mono text-xs font-medium text-muted-foreground">
      {t('membersSelected', { selected: selected.length, total })}
    </span>
  )

  return (
    <SectionCard {...header} action={count}>
      <p className="text-sm text-muted-foreground">{t('membersHelp')}</p>

      {agents.agents.length === 0 && missing.length === 0 ? (
        <div className="flex flex-col gap-3 rounded-md border bg-muted p-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <p className="font-medium text-foreground">{t('membersEmpty')}</p>
            <p>{t('membersEmptyHint')}</p>
          </div>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/agents/new" target="_blank" rel="noopener">
              {t('createAgent')}{' '}
              <ExternalLink aria-hidden="true" />
              <span className="sr-only">{tc('opensInNewTab')}</span>
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('membersSearch')}
              aria-label={t('membersSearchAria')}
              autoComplete="off"
              className="pl-10"
            />
          </div>

          <fieldset ref={groupRef} className="m-0 min-w-0 border-0 p-0">
            <legend className="sr-only">{t('membersGroup')}</legend>
            <ul className="grid grid-cols-1 gap-3 p-0.5 md:max-h-80 md:grid-cols-2 md:overflow-y-auto">
              {missing.map((id, position) => (
                <li key={`missing-${id}`} className="min-w-0">
                  <OptionCard
                    id={`team-member-missing-${position}`}
                    type="checkbox"
                    checked
                    disabled={locked}
                    onChange={() => toggle(id)}
                    describedBy={`team-member-missing-${position}-note`}
                    label={<span className="font-mono text-sm">{id}</span>}
                  >
                    {beyondPage ? (
                      <p
                        id={`team-member-missing-${position}-note`}
                        className="text-xs text-muted-foreground"
                      >
                        {t('membersNotLoaded', { shown: agents.agents.length, total: agents.total })}
                      </p>
                    ) : (
                      <FieldWarning id={`team-member-missing-${position}-note`}>
                        {t('memberMissing')}
                      </FieldWarning>
                    )}
                  </OptionCard>
                </li>
              ))}
              {visible.map(({ agent, index }, position) => (
                <li key={agent.id} className="min-w-0">
                  <OptionCard
                    id={`team-member-${index}`}
                    type="checkbox"
                    checked={selected.includes(agent.id)}
                    disabled={locked}
                    onChange={() => toggle(agent.id)}
                    inputRef={position === 0 && missing.length === 0 ? firstRef : undefined}
                    describedBy={errorTarget(agent.id, position === 0)}
                    invalid={!!error && position === 0}
                    description={agent.descricao || undefined}
                    label={
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex flex-wrap items-center gap-2">
                          {agent.nome}
                          {!agent.active && (
                            <span className={badgeVariants({ variant: 'neutral' })}>
                              {tt('inactive')}
                            </span>
                          )}
                        </span>
                        <span className="truncate font-mono text-xs font-normal text-muted-foreground">
                          {agentMeta(agent)}
                        </span>
                      </span>
                    }
                  />
                </li>
              ))}
            </ul>
          </fieldset>

          {visible.length === 0 && (
            <div className="flex flex-col gap-3 rounded-md border bg-muted p-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <p>{t('membersNoMatch', { query: query.trim() })}</p>
              <Button type="button" variant="outline" onClick={() => setQuery('')}>
                {t('clearSearch')}
              </Button>
            </div>
          )}
        </>
      )}
      <FieldError id={ERROR_ID} message={error} />
    </SectionCard>
  )
}
