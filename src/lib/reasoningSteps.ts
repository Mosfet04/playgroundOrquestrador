import { z } from 'zod'

import type { ReasoningSteps, ToolCall } from '@/types/playground'

// Os passos de raciocínio do agno 3 chegam em três lugares do stream
// (ReasoningStep.content, ReasoningCompleted.content.reasoning_steps e
// RunCompleted.reasoning_steps). Os dois primeiros omitem o campo None; o
// último o manda como null. Aqui tudo vira o mesmo formato: campo ausente é
// `undefined`, e passo sem título não entra.
const optionalText = z.string().nullish().catch(undefined)
const reasoningStepSchema = z.object({
  title: z.string(),
  action: optionalText,
  result: optionalText,
  reasoning: optionalText,
  next_action: optionalText,
  // Fora de [0, 1] não é confiança: o painel mostraria "800%".
  confidence: z.number().min(0).max(1).nullish().catch(undefined)
})

/** O passo do `ReasoningStep.content`; `null` se não for um passo com título. */
export const parseReasoningStep = (raw: unknown): ReasoningSteps | null => {
  const parsed = reasoningStepSchema.safeParse(raw)
  if (!parsed.success) return null
  const { title, action, result, reasoning, next_action, confidence } = parsed.data
  return {
    title,
    ...(action != null && { action }),
    ...(result != null && { result }),
    ...(reasoning != null && { reasoning }),
    ...(next_action != null && { next_action }),
    ...(confidence != null && { confidence })
  }
}

/** Lista de passos (`reasoning_steps`); o que não for passo é ignorado. */
export const parseReasoningSteps = (raw: unknown): ReasoningSteps[] =>
  Array.isArray(raw) ? raw.flatMap((step) => parseReasoningStep(step) ?? []) : []

/** Os passos do `content` do ReasoningCompleted (`{ reasoning_steps: [...] }`). */
export const parseCompletedSteps = (content: unknown): ReasoningSteps[] =>
  typeof content === 'object' && content !== null && 'reasoning_steps' in content
    ? parseReasoningSteps(content.reasoning_steps)
    : []

const indexOfNth = (steps: ReasoningSteps[], title: string, nth: number): number => {
  let seen = 0
  for (const [index, step] of steps.entries()) {
    if (step.title === title && seen++ === nth) return index
  }
  return -1
}

/**
 * Junta uma lista completa de passos (ReasoningCompleted, RunCompleted) aos já
 * recebidos sem duplicar. Identidade: título + ordem, a n-ésima ocorrência do
 * título na lista que chega é a n-ésima já recebida com ele. Passo novo entra
 * no fim.
 */
export const mergeReasoningSteps = (
  existing: ReasoningSteps[],
  incoming: ReasoningSteps[]
): ReasoningSteps[] => {
  const merged = [...existing]
  const occurrences = new Map<string, number>()
  for (const step of incoming) {
    const nth = occurrences.get(step.title) ?? 0
    occurrences.set(step.title, nth + 1)
    const index = indexOfNth(merged, step.title, nth)
    if (index >= 0) merged[index] = step
    else merged.push(step)
  }
  return merged
}

const REASONING_TOOLS = ['think', 'analyze']

// Como o agno liga a tool ao passo (agent/_response.py,
// update_reasoning_content_from_tool_call): pelo `title`; o `think` só com
// `thought` vira o passo "Thinking" com esse texto no `reasoning`.
const isToolOfStep = (tool: ToolCall, step: ReasoningSteps): boolean => {
  if (typeof tool.tool_name !== 'string' || !REASONING_TOOLS.includes(tool.tool_name.toLowerCase()))
    return false
  const args: Record<string, unknown> | undefined = tool.tool_args
  if (args?.title !== undefined) return args.title === step.title
  return args?.thought !== undefined && args.thought === step.reasoning
}

/**
 * O agno vira em raciocínio a tool `think`/`analyze` de cada ReasoningStep: o
 * chip dela sai, o passo vai para o painel. A tool de mesmo nome sem passo
 * correspondente (uma tool do usuário) fica com o chip.
 */
export const dropReasoningToolCall = (
  toolCalls: ToolCall[],
  step: ReasoningSteps
): ToolCall[] => {
  const index = toolCalls.findLastIndex((tool) => isToolOfStep(tool, step))
  return index < 0 ? toolCalls : toolCalls.filter((_, i) => i !== index)
}
