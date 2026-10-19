'use client'

import { useCallback, useEffect, useState } from 'react'
import { useQueryState } from 'nuqs'
import { useTranslations } from 'next-intl'

import { usePlaygroundStore } from '@/store'

import SessionItem from './SessionItem'
import SessionBlankState from './SessionBlankState'
import { Skeleton } from '@/components/ui/skeleton'
import { panelLabelClass } from '../panelLabel'

// Lista de sessões: ocupa o resto do painel e rola sozinha.
const Sessions = () => {
  const [sessionId] = useQueryState('session')
  const [agentId] = useQueryState('agent')
  const [teamId] = useQueryState('team')
  const t = useTranslations('playground')

  // A carga das sessões (lista e a de ?session=) fica no ChatArea.
  const {
    isEndpointActive,
    isEndpointLoading,
    hasStorage,
    sessionsData,
    isSessionsLoading,
    sessionsError,
    mode
  } = usePlaygroundStore()

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null
  )

  useEffect(() => {
    if (sessionId) setSelectedSessionId(sessionId)
  }, [sessionId])

  const handleSessionClick = useCallback(
    (id: string) => () => setSelectedSessionId(id),
    []
  )

  const sessions = Array.isArray(sessionsData) ? sessionsData : []
  // Com falha anterior, a nova tentativa fica na caixa de erro ("Tentando…").
  const isLoading = (isSessionsLoading && !sessionsError) || isEndpointLoading
  const isBlank =
    !isEndpointActive ||
    !(mode === 'team' ? teamId : agentId) ||
    sessionsError ||
    !hasStorage ||
    sessions.length === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <p className={panelLabelClass}>{t('sessions')}</p>
      <div className="min-h-0 flex-1 overflow-y-auto font-sans">
        {isLoading ? (
          <div className="flex flex-col gap-1">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-11 rounded-md lg:h-9" />
            ))}
          </div>
        ) : isBlank ? (
          <SessionBlankState />
        ) : (
          <ul className="flex flex-col gap-0.5">
            {sessions.map((entry, idx) => (
              <li key={`${entry.session_id}-${idx}`}>
                <SessionItem
                  {...entry}
                  currentSessionId={selectedSessionId}
                  isSelected={selectedSessionId === entry.session_id}
                  onSessionClick={handleSessionClick(entry.session_id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default Sessions
