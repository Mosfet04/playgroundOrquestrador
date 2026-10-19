import { useQueryState } from 'nuqs'
import { useFormatter, useTranslations } from 'next-intl'
import { SessionEntry } from '@/types/playground'
import { Button } from '../../../ui/button'
import useSessionLoader from '@/hooks/useSessionLoader'
import {
  deletePlaygroundSessionAPI,
  deletePlaygroundTeamSessionAPI
} from '@/api/playground'
import { usePlaygroundStore } from '@/store'
import { toast } from 'sonner'
import Icon from '@/components/ui/icon'
import { useState } from 'react'
import DeleteSessionModal from './DeleteSessionModal'
import useChatActions from '@/hooks/useChatActions'
import { cn, focusRing } from '@/lib/utils'

// Horário da sessão: hoje HH:mm, ontem "ontem", antes dd/MM no idioma. No fuso
// do navegador: a lista só renderiza no cliente (sem risco de hidratação).
// Data inválida (created_at ausente ou fora de faixa): sem horário.
function useSessionTime(createdAt: number) {
  const format = useFormatter()
  const t = useTranslations('playground')
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const date = new Date(createdAt * 1000)
  if (Number.isNaN(date.getTime())) return ''
  const day = (value: Date) =>
    format.dateTime(value, { year: 'numeric', month: '2-digit', day: '2-digit', timeZone })
  const now = Date.now()
  if (day(date) === day(new Date(now)))
    return format.dateTime(date, { hour: '2-digit', minute: '2-digit', timeZone })
  if (day(date) === day(new Date(now - 86_400_000))) return t('yesterday')
  return format.dateTime(date, { day: '2-digit', month: '2-digit', timeZone })
}

type SessionItemProps = SessionEntry & {
  isSelected: boolean
  currentSessionId: string | null
  onSessionClick: () => void
}
const SessionItem = ({
  title,
  session_id,
  created_at,
  isSelected,
  currentSessionId,
  onSessionClick
}: SessionItemProps) => {
  const [agentId] = useQueryState('agent')
  const [teamId] = useQueryState('team')
  const [, setSessionId] = useQueryState('session')
  const { getSession } = useSessionLoader()
  const { selectedEndpoint, sessionsData, setSessionsData, mode } =
    usePlaygroundStore()
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const { clearChat } = useChatActions()
  const t = useTranslations('playground')
  const tc = useTranslations('common')
  const time = useSessionTime(created_at)

  const handleGetSession = async () => {
    if (!(agentId || teamId)) return

    onSessionClick()
    await getSession(
      {
        entityType: mode,
        agentId,
        teamId
      },
      session_id
    )
    setSessionId(session_id)
  }

  const handleDeleteSession = async () => {
    if (!(agentId || teamId)) return
    setIsDeleting(true)
    try {
      let response
      if (mode === 'team' && teamId) {
        response = await deletePlaygroundTeamSessionAPI(
          selectedEndpoint,
          teamId,
          session_id
        )
      } else if (mode === 'agent' && agentId) {
        response = await deletePlaygroundSessionAPI(
          selectedEndpoint,
          agentId,
          session_id
        )
      } else {
        throw new Error('No valid agent or team context for deletion')
      }

      if (response?.ok && sessionsData) {
        setSessionsData(sessionsData.filter((s) => s.session_id !== session_id))
        // If the deleted session was the active one, clear the chat
        if (currentSessionId === session_id) {
          setSessionId(null)
          clearChat()
        }
        toast.success(t('sessionDeleted'))
      } else {
        // O corpo da resposta não vai à UI: só a frase e o código (P1-04b).
        toast.error(
          tc('withCode', {
            message: t('deleteSessionError'),
            status: response.status
          })
        )
      }
    } catch (error) {
      console.error('Error deleting session:', error)
      toast.error(t('deleteSessionError'))
    } finally {
      setIsDeleteModalOpen(false)
      setIsDeleting(false)
    }
  }
  // Linha = botão; a lixeira toma o lugar do horário no hover e no foco.
  return (
    <>
      <div className="group relative">
        <button
          type="button"
          aria-current={isSelected ? 'true' : undefined}
          onClick={handleGetSession}
          className={cn(
            'flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground lg:min-h-9',
            focusRing,
            isSelected ? 'bg-primary-soft font-medium' : 'group-hover:bg-accent'
          )}
        >
          <span className="truncate">{title}</span>
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground group-focus-within:invisible group-hover:invisible">
            {time}
          </span>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 size-7 -translate-y-1/2 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
          onClick={() => setIsDeleteModalOpen(true)}
          aria-label={t('deleteSession', { title })}
        >
          <Icon type="trash" size="xs" />
        </Button>
      </div>
      <DeleteSessionModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onDelete={handleDeleteSession}
        isDeleting={isDeleting}
      />
    </>
  )
}

export default SessionItem
