import MarkdownRenderer from '@/components/ui/typography/MarkdownRenderer'
import { usePlaygroundStore } from '@/store'
import type { PlaygroundChatMessage } from '@/types/playground'
import Videos from './Multimedia/Videos'
import Images from './Multimedia/Images'
import Audios from './Multimedia/Audios'
import { memo } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

interface MessageProps {
  message: PlaygroundChatMessage
}

// Texto e mídia da resposta. Em stream, o cursor `signal` fica no fim do
// markdown (.stream-caret, src/app/globals.css); antes do 1º token, sozinho.
const AgentMessage = ({ message, streaming }: MessageProps & { streaming: boolean }) => {
  const { streamingErrorMessage } = usePlaygroundStore()
  const t = useTranslations('playground')
  if (message.streamingError) {
    // O tipo do erro é traduzido aqui (muda junto com o idioma); o detalhe é
    // o texto do orquestrador, mostrado como dado (P1-04b).
    return (
      <p className="text-destructive">
        {t('streamError')}{' '}
        {streamingErrorMessage
          ? t(`streamErrorKind.${streamingErrorMessage.kind}`)
          : t('streamErrorHint')}
        {streamingErrorMessage?.detail && <> {streamingErrorMessage.detail}</>}
      </p>
    )
  }

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
    </>
  )
}

// Bolha do usuário à direita, em primary-soft (docs/design/P1-06.md).
const UserMessage = memo(({ message }: MessageProps) => (
  <p className="max-w-[80%] self-end whitespace-pre-wrap break-words rounded-lg rounded-br-sm bg-primary-soft px-4 py-2.5 text-foreground">
    {message.content}
  </p>
))

AgentMessage.displayName = 'AgentMessage'
UserMessage.displayName = 'UserMessage'
export { AgentMessage, UserMessage }
