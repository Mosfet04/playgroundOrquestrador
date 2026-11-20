import { describe, expect, it } from 'vitest'

import {
  dropReasoningToolCall,
  mergeReasoningSteps,
  parseReasoningStep
} from '@/lib/reasoningSteps'
import type { ToolCall } from '@/types/playground'

const tool = (tool_name: string, title: string): ToolCall => ({
  role: 'tool',
  content: null,
  tool_call_id: `${tool_name}-${title}`,
  tool_name,
  tool_args: { title },
  created_at: 1
})

describe('parseReasoningStep', () => {
  it('descarta null e campo de tipo errado, mantém o resto', () => {
    expect(
      parseReasoningStep({ title: 'A', action: null, result: 3, reasoning: 'r', confidence: '0.5' })
    ).toEqual({ title: 'A', reasoning: 'r' })
  })

  it('confiança fora de 0 a 1 não vira confiança', () => {
    expect(parseReasoningStep({ title: 'A', confidence: 8 })).toEqual({ title: 'A' })
    expect(parseReasoningStep({ title: 'A', confidence: -1 })).toEqual({ title: 'A' })
    expect(parseReasoningStep({ title: 'A', confidence: 0 })).toEqual({ title: 'A', confidence: 0 })
  })

  it('sem título string, não é passo', () => {
    expect(parseReasoningStep({ title: null, action: 'x' })).toBeNull()
    expect(parseReasoningStep('x')).toBeNull()
  })
})

describe('mergeReasoningSteps: identidade título + ordem', () => {
  it('a n-ésima ocorrência do título é o mesmo passo; o que falta entra no fim', () => {
    const merged = mergeReasoningSteps(
      [{ title: 'A' }, { title: 'B' }, { title: 'A', reasoning: 'segundo' }],
      [{ title: 'A', action: 'novo' }, { title: 'A', reasoning: 'segundo' }, { title: 'C' }]
    )

    expect(merged).toEqual([
      { title: 'A', action: 'novo' },
      { title: 'B' },
      { title: 'A', reasoning: 'segundo' },
      { title: 'C' }
    ])
  })
})

describe('dropReasoningToolCall', () => {
  it('tira só a última think/analyze com o título do passo, sem diferenciar caixa', () => {
    const calls = [tool('think', 'A'), tool('Think', 'A'), tool('analyze', 'B'), tool('buscar', 'A')]

    const left = dropReasoningToolCall(calls, { title: 'A' })

    expect(left).toEqual([calls[0], calls[2], calls[3]])
  })

  it('tool de outro título ou de outro nome continua', () => {
    const calls = [tool('think', 'X'), tool('buscar', 'A')]

    expect(dropReasoningToolCall(calls, { title: 'A' })).toEqual(calls)
  })

  // Case 3 do agno (`think` só com `thought`): o passo se chama "Thinking" e
  // o `reasoning` é o `thought`.
  it('think só com thought casa pelo thought, não pelo título', () => {
    const simple: ToolCall = { ...tool('think', ''), tool_args: { thought: 'Pensei.' } }
    const other: ToolCall = { ...tool('think', ''), tool_args: { thought: 'Outro.' } }

    expect(dropReasoningToolCall([other, simple], { title: 'Thinking', reasoning: 'Pensei.' })).toEqual([
      other
    ])
  })

  it('tool_name ou tool_args que não são do formato esperado ficam, sem lançar', () => {
    const odd = { ...tool('think', 'A'), tool_name: 5 } as unknown as ToolCall
    const noArgs = { ...tool('think', 'A'), tool_args: 'x' } as unknown as ToolCall

    expect(dropReasoningToolCall([odd, noArgs], { title: 'A' })).toEqual([odd, noArgs])
  })
})
