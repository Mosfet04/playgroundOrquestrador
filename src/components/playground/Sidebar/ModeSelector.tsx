'use client'

import * as React from 'react'
import { usePlaygroundStore } from '@/store'
import { useQueryState } from 'nuqs'
import { useTranslations } from 'next-intl'
import useChatActions from '@/hooks/useChatActions'
import { cn, focusRing } from '@/lib/utils'

// Segmentado Agente | Team (docs/design/P1-06.md): o lado sem entidades fica
// desabilitado; `labelledBy` é o rótulo "Conversar com" do painel.
export function ModeSelector({ labelledBy }: { labelledBy: string }) {
  const { mode, setMode, teams, agents, setHasStorage } = usePlaygroundStore()
  const { clearChat } = useChatActions()
  const [, setAgentId] = useQueryState('agent')
  const [, setTeamId] = useQueryState('team')
  const t = useTranslations('playground')

  const hasTeams = teams.length > 0
  const hasAgents = agents.length > 0

  // A aba vai à URL no clique, com a 1ª entidade dela (o lado sem entidades
  // fica desabilitado): um reload antes da próxima carga do orquestrador volta
  // na mesma aba (QA1-02). `clearChat` tira a sessão e aborta o run.
  const handleModeChange = (newMode: 'agent' | 'team') => {
    if (newMode === mode) return
    const [first] = newMode === 'team' ? teams : agents

    setMode(newMode)
    setAgentId(newMode === 'agent' ? first.value : null)
    setTeamId(newMode === 'team' ? first.value : null)
    setHasStorage(!!first.storage)
    clearChat()
  }

  React.useEffect(() => {
    if (!hasTeams && hasAgents && mode === 'team') {
      setMode('agent')
    } else if (!hasAgents && hasTeams && mode === 'agent') {
      setMode('team')
    }
  }, [hasTeams, hasAgents, mode, setMode])

  const options = [
    { value: 'agent', label: t('modeAgent'), enabled: hasAgents },
    { value: 'team', label: t('modeTeam'), enabled: hasTeams }
  ] as const

  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className="grid grid-cols-2 gap-0.5 rounded-md border border-border bg-muted p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={mode === option.value}
          disabled={!option.enabled}
          onClick={() => handleModeChange(option.value)}
          className={cn(
            'h-10 rounded-sm text-sm text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 lg:h-[30px]',
            focusRing,
            mode === option.value && 'bg-card font-medium text-foreground ring-1 ring-border'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
