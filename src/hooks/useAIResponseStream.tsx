import { useCallback } from 'react'
import { z } from 'zod'

import { redirectToLogin } from '@/api/playground'
import { type RunResponse } from '@/types/playground'
import { type StreamingError } from '@/store'

// Fronteira do stream (P2-03): evento sem `event` é descartado; número que
// não é número (tempo, tokens, created_at) vira ausente, sem quebrar a
// conversa. O resto do evento segue como veio (texto, mídia, raciocínio).
const optionalNumber = z.number().optional().catch(undefined)
const toolSchema = z.looseObject({
  metrics: z.object({ duration: optionalNumber }).optional().catch(undefined)
})
const runEventSchema = z.looseObject({
  event: z.string(),
  session_id: z.string().optional().catch(undefined),
  created_at: optionalNumber,
  tool: toolSchema.optional().catch(undefined),
  tools: z.array(toolSchema).optional().catch(undefined),
  metrics: z
    .object({
      duration: optionalNumber,
      input_tokens: optionalNumber,
      output_tokens: optionalNumber
    })
    .optional()
    .catch(undefined)
})

function processChunk(json: unknown, onChunk: (chunk: RunResponse) => void) {
  const parsed = runEventSchema.safeParse(json)
  // Campos usados já validados acima; os demais o handler confere no uso.
  if (parsed.success) onChunk(parsed.data as unknown as RunResponse)
}

/**
 * Parses a string buffer to extract complete JSON objects.
 *
 * This function discards any extraneous data before the first '{', then
 * repeatedly finds and processes complete JSON objects.
 *
 * @param text - The accumulated string buffer.
 * @param onChunk - Callback to process each parsed JSON object.
 * @returns Remaining string that did not form a complete JSON object.
 */
/**
 * Extracts complete JSON objects from a buffer string **incrementally**.
 * - It allows partial JSON objects to accumulate across chunks.
 * - It ensures real-time streaming updates.
 */
function parseBuffer(
  buffer: string,
  onChunk: (chunk: RunResponse) => void
): string {
  let jsonStartIndex = buffer.indexOf('{')
  let jsonEndIndex = -1

  while (jsonStartIndex !== -1) {
    let braceCount = 0
    let inString = false
    let escaped = false

    // Iterate through the buffer to find the end of the JSON object
    for (let i = jsonStartIndex; i < buffer.length; i++) {
      const char = buffer[i]

      // Inside a string, a backslash escapes the next character (so `\\"`
      // is an escaped backslash followed by the closing quote)
      if (escaped) {
        escaped = false
      } else if (inString && char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = !inString
      }

      // If the character is not inside a string, count the braces
      if (!inString) {
        if (char === '{') braceCount++
        if (char === '}') braceCount--
      }

      // If the brace count is 0, we have found the end of the JSON object
      if (braceCount === 0) {
        jsonEndIndex = i
        break
      }
    }

    // If we found a complete JSON object, process it
    if (jsonEndIndex !== -1) {
      const jsonString = buffer.slice(jsonStartIndex, jsonEndIndex + 1)
      // Objeto completo que o JSON.parse recusa (NaN/Infinity do allow_nan do
      // agno, vírgula sobrando) é descartado e o stream segue (review P2-03).
      let json: unknown
      try {
        json = JSON.parse(jsonString)
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error
        console.warn('Evento do stream descartado: JSON inválido')
      }
      if (json !== undefined) processChunk(json, onChunk)
      buffer = buffer.slice(jsonEndIndex + 1).trim()
      jsonStartIndex = buffer.indexOf('{')
      jsonEndIndex = -1
    } else {
      // No complete JSON found, wait for the next chunk
      break
    }
  }

  return buffer
}

/**
 * Custom React hook to handle streaming API responses as JSON objects.
 *
 * This hook:
 * - Accumulates partial JSON data from streaming responses.
 * - Extracts complete JSON objects and processes them via onChunk.
 * - Handles errors via onError and signals completion with onComplete.
 *
 * @returns An object containing the streamResponse function.
 */
export default function useAIResponseStream() {
  const streamResponse = useCallback(
    async (options: {
      apiUrl: string
      requestBody: Record<string, unknown>
      // Abortado (troca de conversa, saída): nenhum callback depois disso.
      signal: AbortSignal
      onChunk: (chunk: RunResponse) => void
      onError: (error: StreamingError) => void
      onComplete: () => void
    }): Promise<void> => {
      const { apiUrl, requestBody, signal, onError, onComplete } = options
      const onChunk = (chunk: RunResponse) => {
        if (!signal.aborted) options.onChunk(chunk)
      }

      // Buffer to accumulate partial JSON data.
      let buffer = ''

      let response: Response
      try {
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal
        })
      } catch (error) {
        if (signal.aborted) return
        // Sem resposta do servidor do playground: a exceção fica no console.
        console.error('Error starting the chat stream:', error)
        onError({ kind: 'network' })
        return
      }
      // Sessão expirada: login, sem bolha de erro (docs/design/P2-03.md).
      if (response.status === 401) return redirectToLogin()
      // O BFF não ecoa o corpo do orquestrador: só o tipo pelo status.
      if (!response.ok || !response.body) {
        onError({
          kind: [503, 504].includes(response.status) ? 'unavailable' : 'runError'
        })
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          buffer = parseBuffer(buffer, onChunk)
        }
        parseBuffer(buffer, onChunk)
      } catch (error) {
        if (signal.aborted) return
        // Conexão caiu no meio: quem chama vê o fim sem o RunCompleted.
        console.error('Error reading the chat stream:', error)
      }
      onComplete()
    },
    []
  )

  return { streamResponse }
}
