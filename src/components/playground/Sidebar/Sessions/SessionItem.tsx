import { useQueryState } from 'nuqs'
import { useFormatter, useTranslations } from 'next-intl'
import { SessionEntry } from '@/types/playground'
import { Button } from '../../../ui/button'
import useSessionLoader from '@/hooks/useSessionLoader'
import { PlaygroundRequestError, deletePlaygroundSessionAPI } from '@/api/playground'
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
  const { setSessionsData, mode } = usePlaygroundStore()
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const { clearChat } = useChatActions()
  const t = useTranslations('playground')
  const tc = useTranslations('common')
  const time = useSessionTime(created_at)

  const handleGetSession = async () => {
    if (!(agentId || teamId)) return

    // Outra sessão é outra conversa: o run em andamento é abortado antes de
    // trocar o histórico (D-P2-03-4, decisão 0020).
    usePlaygroundStore.getState().runAbortController?.abort()
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
      await deletePlaygroundSessionAPI(session_id)
      setSessionsData(
        (prev) => prev?.filter((s) => s.session_id !== session_id) ?? null
      )
      // If the deleted session was the active one, clear the chat
      if (currentSessionId === session_id) {
        setSessionId(null)
        clearChat()
      }
      toast.success(t('sessionDeleted'))
    } catch (error) {
      // O corpo da resposta não vai à UI: só a frase e o código (P1-04b).
      console.error('Error deleting session:', error)
      const status = error instanceof PlaygroundRequestError ? error.status : undefined
      toast.error(
        status === undefined
          ? t('deleteSessionError')
          : tc('withCode', { message: t('deleteSessionError'), status })
      )
    } finally {
      setIsDeleteModalOpen(false)
      setIsDeleting(false)
    }
  }
  // Linha = botão. Em lg+ a lixeira toma o lugar do horário no hover e no
  // foco; abaixo (Sheet, toque sem hover) fica sempre visível, 44×44, depois
  // do horário (docs/design/P2-03.md).
  return (
    <>
      <div className="group relative flex items-center gap-1">
        <button
          type="button"
          aria-current={isSelected ? 'true' : undefined}
          onClick={handleGetSession}
          className={cn(
            'flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground lg:min-h-9',
            focusRing,
            isSelected ? 'bg-primary-soft font-medium' : 'group-hover:bg-accent'
          )}
        >
          <span className="truncate">{title}</span>
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground lg:group-focus-within:invisible lg:group-hover:invisible">
            {time}
          </span>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 max-lg:text-muted-foreground lg:absolute lg:right-1 lg:top-1/2 lg:size-7 lg:-translate-y-1/2 lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100"
          onClick={() => setIsDeleteModalOpen(true)}
          aria-label={t('deleteSession', { title })}
        >
          <Icon type="trash" size="xs" className="max-lg:text-muted-foreground" />
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
