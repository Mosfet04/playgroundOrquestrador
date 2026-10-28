'use client'

import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { ChevronsUpDown } from 'lucide-react'
import {
  Select,
  SelectValue,
  SelectContent,
  SelectItem
} from '@/components/ui/select'
import { usePlaygroundStore } from '@/store'
import { useQueryState } from 'nuqs'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import useChatActions from '@/hooks/useChatActions'
import { EntityAvatar } from '@/components/playground/EntityAvatar'
import { cn, focusRing } from '@/lib/utils'

// Cartão da entidade (docs/design/P1-06.md): o trigger do Select com avatar,
// nome e provider/modelo; o trigger do Radix direto, porque o do shadcn
// fixa o ícone de seta para baixo e não as setas do cartão.
export function EntitySelector() {
  const {
    mode,
    agents,
    teams,
    setHasStorage
  } = usePlaygroundStore()
  const { clearChat, focusChatInput } = useChatActions()
  const [agentId, setAgentId] = useQueryState('agent', {
    parse: (value) => value || undefined,
    history: 'push'
  })
  const [teamId, setTeamId] = useQueryState('team', {
    parse: (value) => value || undefined,
    history: 'push'
  })
  const t = useTranslations('playground')

  const currentEntities = mode === 'team' ? teams : agents
  const currentValue = mode === 'team' ? teamId : agentId
  const placeholder = mode === 'team' ? t('selectTeam') : t('selectAgent')

  useEffect(() => {
    if (currentValue && currentEntities.length > 0) {
      const entity = currentEntities.find((item) => item.value === currentValue)
      if (entity) {
        setHasStorage(!!entity.storage)
        if (entity.model.provider) {
          focusChatInput()
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentValue, currentEntities, mode])

  const handleOnValueChange = (value: string) => {
    const newValue = value === currentValue ? null : value
    const selectedEntity = currentEntities.find(
      (item) => item.value === newValue
    )

    setHasStorage(!!selectedEntity?.storage)

    if (mode === 'team') {
      setTeamId(newValue)
      setAgentId(null)
    } else {
      setAgentId(newValue)
      setTeamId(null)
    }

    clearChat()

    if (selectedEntity?.model.provider) {
      focusChatInput()
    }
  }

  const isEmpty = currentEntities.length === 0
  const selected = currentEntities.find((item) => item.value === currentValue)
  const name = selected ? selected.label || selected.value : ''
  const providerModel = selected
    ? [selected.model.provider, selected.model.model].filter(Boolean).join('/')
    : ''
  const emptyText = mode === 'team' ? t('noTeams') : t('noAgents')

  return (
    <Select
      value={currentValue || ''}
      onValueChange={(value) => handleOnValueChange(value)}
      disabled={isEmpty}
    >
      <SelectPrimitive.Trigger
        aria-label={
          selected
            ? mode === 'team'
              ? t('entityTeam', { name })
              : t('entityAgent', { name })
            : undefined
        }
        className={cn(
          'flex min-h-14 w-full items-center gap-3 rounded-lg border border-border bg-background p-3 text-left text-sm text-foreground data-[placeholder]:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
          focusRing
        )}
      >
        <SelectValue placeholder={isEmpty ? emptyText : placeholder}>
          {selected && (
            <span className="flex min-w-0 items-center gap-3">
              <EntityAvatar name={selected.label} id={selected.value} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{name}</span>
                {providerModel && (
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {providerModel}
                  </span>
                )}
              </span>
            </span>
          )}
        </SelectValue>
        <SelectPrimitive.Icon asChild>
          <ChevronsUpDown aria-hidden="true" className="ml-auto size-4 shrink-0 text-muted-foreground" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectContent>
        {currentEntities.map((entity, index) => (
          <SelectItem
            className="cursor-pointer"
            key={`${entity.value}-${index}`}
            value={entity.value}
          >
            <span className="flex items-center gap-2">
              <EntityAvatar name={entity.label} id={entity.value} className="size-5" />
              <span>{entity.label}</span>
              <span className="font-mono text-xs text-muted-foreground">{entity.value}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
