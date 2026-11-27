import MarkdownRenderer from '@/components/ui/typography/MarkdownRenderer'
import { Button } from '@/components/ui/button'
import { usePlaygroundStore, type StreamingError } from '@/store'
import type { PlaygroundChatMessage } from '@/types/playground'
import Videos from './Multimedia/Videos'
import Images from './Multimedia/Images'
import Audios from './Multimedia/Audios'
import { memo, useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AlertCircle, ChevronRight, MessageSquareOff, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MessageProps {
  message: PlaygroundChatMessage
}

// Reenviar (D-QA1-03-2). Com um run em andamento fica aria-disabled, com o
// motivo no title, sem sumir (o layout não salta); quem recebe o clique o
// ignora nesse caso (MessageArea).
const ResendButton = ({ onResend }: { onResend: () => void }) => {
  const isStreaming = usePlaygroundStore((state) => state.isStreaming)
  const t = useTranslations('playground')
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-disabled={isStreaming || undefined}
      title={isStreaming ? t('resendWait') : undefined}
      onClick={onResend}
      className="h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 md:h-8 [&_svg]:size-3.5"
    >
      <RotateCcw aria-hidden="true" />
      {t('resend')}
    </Button>
  )
}

// Sem Reenviar: a pessoa cancelou, não havia para quem enviar ou a conversa é
// de outro usuário (reenviar falharia igual).
const NO_RESEND: StreamingError['kind'][] = ['cancelled', 'noEntity', 'sessionNotOwned']

// Erro do run (docs/design/QA1-03.md, § 3.1): a frase pelo tipo, traduzida
// aqui (muda com o idioma), o texto do provedor saneado pelo BFF só no
// colapsável e o Reenviar. O texto parcial do stream fica acima (P2-03).
const RunErrorNotice = ({ onResend }: { onResend?: () => void }) => {
  const error = usePlaygroundStore((state) => state.streamingErrorMessage)
  const t = useTranslations('playground')
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const toggleRef = useRef<HTMLButtonElement>(null)
  // O painel abre embaixo, na conversa ancorada: o gatilho segue à vista.
  useEffect(() => {
    if (open) toggleRef.current?.scrollIntoView({ block: 'nearest' })
  }, [open])

  const text = !error
    ? t('streamErrorHint')
    : error.kind === 'invalidParam'
      ? t.rich('streamErrorKind.invalidParam', {
          param: error.param,
          mono: (chunks) => <code className="font-mono">{chunks}</code>
        })
      : t(`streamErrorKind.${error.kind}`)
  const detail = error?.detail
  const resend = !(error && NO_RESEND.includes(error.kind)) && onResend
  return (
    <div role="group" aria-label={t('streamError')}>
      <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
        <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>{text}</span>
      </p>
      {(resend || detail) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {resend && <ResendButton onResend={resend} />}
          {detail && (
            <Button
              ref={toggleRef}
              type="button"
              variant="link"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen(!open)}
              className="h-auto p-0 text-xs"
            >
              <ChevronRight
                aria-hidden="true"
                className={cn('motion-safe:transition-transform', open && 'rotate-90')}
              />
              {t('technicalDetails')}
            </Button>
          )}
        </div>
      )}
      {detail && (
        <pre
          id={panelId}
          hidden={!open}
          role="region"
          aria-label={t('technicalDetails')}
          tabIndex={0}
          className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted p-3 font-mono text-xs text-foreground"
        >
          {detail}
        </pre>
      )}
    </div>
  )
}

// Texto e mídia da resposta. Em stream, o cursor `signal` fica no fim do
// markdown (.stream-caret, src/app/globals.css); antes do 1º token, sozinho.
const AgentMessage = ({
  message,
  streaming,
  onResend
}: MessageProps & { streaming: boolean; onResend?: () => void }) => {
  const audio = message.response_audio
  const text = message.content || audio?.transcript
  return (
    <>
      {text ? (
        <MarkdownRenderer classname={cn(streaming && 'stream-caret')}>
          {text}
        </MarkdownRenderer>
      ) : (
        streaming && (
          <p aria-hidden="true" className="stream-caret">
            <span />
          </p>
        )
      )}
      {message.content ? (
        <>
          {message.videos && message.videos.length > 0 && (
            <Videos videos={message.videos} />
          )}
          {message.images && message.images.length > 0 && (
            <Images images={message.images} />
          )}
          {message.audio && message.audio.length > 0 && (
            <Audios audio={message.audio} />
          )}
        </>
      ) : (
        audio?.transcript && audio.content && <Audios audio={[audio]} />
      )}
      {message.streamingError && <RunErrorNotice onResend={onResend} />}
    </>
  )
}

// Markdown do usuário com o renderer seguro do agente (docs/design/QA1-03.md,
// § 3.3): código em card com borda (o muted some no primary-soft), link em
// primary e a quebra de linha simples visível (no parágrafo, o `<br>` da
// quebra forçada some: a quebra de linha depois dele já aparece; no item de
// lista compacta, sem pre-wrap, ele fica).
const USER_MARKDOWN =
  'gap-y-2 [&_div]:whitespace-pre-wrap [&_div_br]:hidden [&_code]:border [&_code]:border-border [&_code]:bg-card [&_code]:text-foreground [&_pre]:overflow-x-auto [&_a]:text-primary [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3'

// Bolha do usuário à direita, em primary-soft (docs/design/P1-06.md). Com
// `onResend`, a pergunta ficou sem resposta (sessão reaberta, QA1-03): a marca
// e o Reenviar abaixo dela.
const UserMessage = memo(
  ({
    message,
    onResend
  }: MessageProps & { onResend?: (question: PlaygroundChatMessage) => void }) => {
    const t = useTranslations('playground')
    return (
      <div className="flex flex-col items-end">
        <div className="max-w-[80%] break-words rounded-lg rounded-br-sm bg-primary-soft px-4 py-2.5 text-foreground">
          <MarkdownRenderer classname={USER_MARKDOWN}>{message.content}</MarkdownRenderer>
        </div>
        {onResend && (
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span
              title={t('unansweredHint')}
              className="inline-flex items-center gap-1 text-muted-foreground"
            >
              <MessageSquareOff aria-hidden="true" className="size-3 shrink-0" />
              {t('unanswered')}
            </span>
            <ResendButton onResend={() => onResend(message)} />
          </div>
        )}
      </div>
    )
  }
)

AgentMessage.displayName = 'AgentMessage'
UserMessage.displayName = 'UserMessage'
export { AgentMessage, UserMessage }
