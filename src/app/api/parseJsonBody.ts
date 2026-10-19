import { NextResponse } from 'next/server'
import type { z } from 'zod'

type ParsedBody<T> =
  | { success: true; data: T }
  | { success: false; response: NextResponse }

const badRequest = (error: string): ParsedBody<never> => ({
  success: false,
  response: NextResponse.json({ success: false, error }, { status: 400 })
})

// Corpo JSON validado pelo schema (só os campos dele seguem adiante). O erro
// cita os campos inválidos, nunca o valor recebido.
export async function parseJsonBody<T extends z.ZodType>(
  request: Request,
  schema: T
): Promise<ParsedBody<z.output<T>>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequest('Corpo da requisição não é um JSON válido')
  }

  const result = schema.safeParse(body)
  if (!result.success) {
    const fields = new Set(
      result.error.issues.map((issue) => issue.path.join('.') || 'corpo')
    )
    return badRequest(`Campos inválidos: ${[...fields].join(', ')}`)
  }
  return { success: true, data: result.data }
}
