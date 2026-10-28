import type { PlaygroundChatMessage, RunMetrics, ToolCall } from '@/types/playground'

import { AgentMessage, UserMessage } from './MessageItem'
import Tooltip from '@/components/ui/tooltip'
import {
  ReasoningStepProps,
  ReasoningProps,
  ReferenceData,
  Reference
} from '@/types/playground'
import React, { type FC } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { Check, CircleX, Wrench } from 'lucide-react'
import ChatBlankState from './ChatBlankState'
import Icon from '@/components/ui/icon'
import { Chip } from '@/components/ui/loading'
import { EntityAvatar } from '@/components/playground/EntityAvatar'
import type { SelectedEntity } from '@/hooks/useSelectedEntity'
import { usePlaygroundStore } from '@/store'

const SEPARATOR = ' · '

interface MessageListProps {
  messages: PlaygroundChatMessage[]
  /** Agente ou team da conversa: nome e modelo na resposta. */
  entity?: SelectedEntity | null
}

interface MessageWrapperProps {
  message: PlaygroundChatMessage
  isLastMessage: boolean
  entity?: SelectedEntity | null
}

interface ReferenceProps {
  references: ReferenceData[]
}

interface ReferenceItemProps {
  reference: Reference
}

const ReferenceItem: FC<ReferenceItemProps> = ({ reference }) => (
  <div className="relative flex h-[63px] w-[190px] cursor-default flex-col justify-between overflow-hidden rounded-md bg-muted p-3 transition-colors hover:bg-accent">
    <p className="text-sm font-medium text-foreground">{reference.name}</p>
    <p className="truncate text-xs text-muted-foreground">{reference.content}</p>
  </div>
)

const References: FC<ReferenceProps> = ({ references }) => (
  <div className="flex flex-col gap-4">
    {references.map((referenceData, index) => (
      <div
        key={`${referenceData.query}-${index}`}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-wrap gap-3">
          {referenceData.references.map((reference, refIndex) => (
            <ReferenceItem
              key={`${reference.name}-${reference.meta_data.chunk}-${refIndex}`}
              reference={reference}
            />
          ))}
        </div>
      </div>
    ))}
  </div>
)

// Resposta do agente (docs/design/P1-06.md, § 2): avatar, nome e modelo,
// raciocínio e referências, chips de tool, texto e mídia; no fim, as métricas
// ou, em stream, "gerando".
const AgentMessageWrapper = ({ message, isLastMessage, entity }: MessageWrapperProps) => {
  const t = useTranslations('playground')
  const isStreaming = usePlaygroundStore((state) => state.isStreaming)
  const streaming = isStreaming && isLastMessage && !message.streamingError
  return (
    <div className="flex items-start gap-3">
      <EntityAvatar name={entity?.name ?? ''} id={entity?.id ?? ''} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{entity?.name}</span>
          {entity?.model && (
            <span className="hidden font-mono text-xs text-muted-foreground md:inline">
              {entity.model}
            </span>
          )}
        </p>
        {message.extra_data?.reasoning_steps &&
          message.extra_data.reasoning_steps.length > 0 && (
            <div className="flex items-start gap-4">
              <Tooltip
                delayDuration={0}
                content={
                  <p className="text-popover-foreground">{t('reasoning')}</p>
                }
                side="top"
              >
                <Icon type="reasoning" size="sm" />
              </Tooltip>
              <div className="flex flex-col gap-3">
                <p className="text-xs uppercase">{t('reasoning')}</p>
                <Reasonings reasoning={message.extra_data.reasoning_steps} />
              </div>
            </div>
          )}
        {message.extra_data?.references &&
          message.extra_data.references.length > 0 && (
            <div className="flex items-start gap-4">
              <Tooltip
                delayDuration={0}
                content={
                  <p className="text-popover-foreground">{t('references')}</p>
                }
                side="top"
              >
                <Icon type="references" size="sm" />
              </Tooltip>
              <div className="flex flex-col gap-3">
                <References references={message.extra_data.references} />
              </div>
            </div>
          )}
        {message.tool_calls && message.tool_calls.length > 0 && (
          <ul aria-label={t('toolCalls')} className="flex flex-wrap gap-2">
            {message.tool_calls.map((toolCall, index) => (
              <ToolCallChip
                key={
                  toolCall.tool_call_id ||
                  `${toolCall.tool_name}-${toolCall.created_at}-${index}`
                }
                tool={toolCall}
                running={streaming}
              />
            ))}
          </ul>
        )}
        <AgentMessage message={message} streaming={streaming} />
        {streaming ? (
          <p className="inline-flex items-center gap-2 font-mono text-xs font-medium text-signal">
            <span aria-hidden="true" className="live-dot size-2 shrink-0 rounded-full bg-current" />
            {t('generating')}
          </p>
        ) : (
          !message.streamingError &&
          message.metrics && <MessageMetrics metrics={message.metrics} />
        )}
      </div>
    </div>
  )
}

// "1,4 s · 812 tokens": só os pedaços com dado (D-P1-06-2, decisão 0015).
const MessageMetrics = ({ metrics }: { metrics: RunMetrics }) => {
  const t = useTranslations('playground')
  const format = useFormatter()
  const tokens = (metrics.input_tokens ?? 0) + (metrics.output_tokens ?? 0)
  const parts = [
    metrics.duration !== undefined &&
      t('metricsTime', {
        seconds: format.number(metrics.duration, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1
        })
      }),
    tokens > 0 && t('metricsTokens', { count: tokens })
  ].filter(Boolean)
  if (parts.length === 0) return null
  return (
    <p className="font-mono text-xs text-muted-foreground">{parts.join(SEPARATOR)}</p>
  )
}

// Chip da tool call: concluída (tempo e check), com erro ou, no stream e
// ainda sem duração, executando. A cor nunca vem sozinha (palavra ou sr-only).
const ToolCallChip = ({ tool, running }: { tool: ToolCall; running: boolean }) => {
  const t = useTranslations('playground')
  const format = useFormatter()
  // O histórico e testes montam tool calls sem passar pela fronteira do stream:
  // duração não numérica conta como ausente.
  const raw: unknown = tool.metrics?.duration
  const duration = typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined
  const name = <span className="font-medium">{tool.tool_name}</span>
  const wrench = <Wrench aria-hidden="true" className="size-3 shrink-0 text-signal" />

  if (tool.tool_call_error)
    return (
      <li title={t('toolErrorTitle')}>
        <Chip className="border-destructive">
          <CircleX aria-hidden="true" className="size-3 shrink-0 text-destructive" />
          {name}
          <span className="text-destructive">{t('toolError')}</span>
        </Chip>
      </li>
    )
  if (running && duration === undefined)
    return (
      <li>
        <Chip>
          {wrench}
          {name}
          <span
            aria-hidden="true"
            className="live-dot ml-1 size-1.5 shrink-0 rounded-full bg-current text-signal"
          />
          <span className="text-muted-foreground">{t('toolRunning')}</span>
        </Chip>
      </li>
    )
  const time =
    duration === undefined ? null : format.number(duration, { maximumFractionDigits: 2 })
  return (
    <li title={time === null ? undefined : t('toolDoneTitle', { seconds: time })}>
      <Chip>
        {wrench}
        {name}
        {time !== null && (
          <span className="text-muted-foreground">{t('metricsTime', { seconds: time })}</span>
        )}
        <Check aria-hidden="true" className="size-3 shrink-0 text-success" />
        <span className="sr-only">{t('toolDone')}</span>
      </Chip>
    </li>
  )
}

const Reasoning: FC<ReasoningStepProps> = ({ index, stepTitle }) => {
  const t = useTranslations('playground')
  return (
    <div className="flex items-center gap-2 text-foreground">
      <div className="flex h-[20px] items-center rounded-md bg-muted p-2">
        <p className="text-xs uppercase">{t('step', { n: index + 1 })}</p>
      </div>
      <p className="text-xs">{stepTitle}</p>
    </div>
  )
}
const Reasonings: FC<ReasoningProps> = ({ reasoning }) => (
  <div className="flex flex-col items-start justify-center gap-2">
    {reasoning.map((title, index) => (
      <Reasoning
        key={`${title.title}-${title.action}-${index}`}
        stepTitle={title.title}
        index={index}
      />
    ))}
  </div>
)

const Messages = ({ messages, entity }: MessageListProps) => {
  if (messages.length === 0) {
    return <ChatBlankState />
  }

  return (
    <>
      {messages.map((message, index) => {
        const key = `${message.role}-${message.created_at}-${index}`
        const isLastMessage = index === messages.length - 1

        if (message.role === 'agent') {
          return (
            <AgentMessageWrapper
              key={key}
              message={message}
              isLastMessage={isLastMessage}
              entity={entity}
            />
          )
        }
        return <UserMessage key={key} message={message} />
      })}
    </>
  )
}

export default Messages
