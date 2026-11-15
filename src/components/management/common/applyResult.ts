// Resultado de aplicação de uma escrita no runtime do orquestrador (P4-01):
// aplicada (com a revisão, quando o BFF a mandou), não aplicada (a config não
// monta; nada gravado, a versão anterior segue no ar) ou não confirmada (o
// orquestrador falhou depois de receber; pode ter gravado sem entrar no ar).
// `restored`: a escrita foi restaurar a versão `from`, gravada como `to` (P4-04).
export type ApplyResult =
  | { status: 'applied'; revision?: number; restored?: { from: number; to: number } }
  | { status: 'not_applied'; errorType?: string }
  | { status: 'not_confirmed' }
export type ApplyFailure = Exclude<ApplyResult, { status: 'applied' }>

// Corpo de erro do BFF, lido uma vez; o que não é JSON fica sem corpo (vale só
// o status).
export const errorBody = (response: Response): Promise<unknown> =>
  response.json().catch(() => null)

const errorCode = (body: unknown) =>
  typeof body === 'object' && body !== null && 'error' in body ? body.error : undefined

// Escrita recusada pela montagem (422 `not_applied`) ou sem confirmação (502
// `not_confirmed`); outro erro ⇒ undefined (segue o tratamento de cada tela).
// Do corpo, só o código e o tipo do erro, que o BFF já filtrou (D-P4-01-2).
export function applyFailure(status: number, body: unknown): ApplyFailure | undefined {
  const error = errorCode(body)
  if (status === 502 && error === 'not_confirmed') return { status: 'not_confirmed' }
  if (status !== 422 || error !== 'not_applied') return undefined
  const errorType =
    typeof body === 'object' && body !== null && 'errorType' in body ? body.errorType : undefined
  return typeof errorType === 'string' && errorType !== ''
    ? { status: 'not_applied', errorType }
    : { status: 'not_applied' }
}
