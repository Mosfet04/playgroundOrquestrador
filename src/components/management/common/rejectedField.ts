// Campo que o orquestrador recusou (422 do BFF, P2-06), se o formulário o
// tem; o BFF já devolve o nome do formulário. Só o nome é lido do corpo (já
// lido por `errorBody`, que o status de aplicação também usa, P4-01).
export function rejectedField<T extends string>(
  status: number,
  body: unknown,
  isFormField: (field: string) => field is T
): T | undefined {
  if (status !== 422) return undefined
  const field = typeof body === 'object' && body !== null && 'field' in body ? body.field : undefined
  return typeof field === 'string' && isFormField(field) ? field : undefined
}
