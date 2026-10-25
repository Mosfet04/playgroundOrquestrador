// Campo que o orquestrador recusou (422 do BFF, P2-06), se o formulário o
// tem; o BFF já devolve o nome do formulário. Só o nome é lido do corpo.
export async function rejectedField<T extends string>(
  response: Response,
  isFormField: (field: string) => field is T
): Promise<T | undefined> {
  if (response.status !== 422) return undefined
  try {
    const body: unknown = await response.json()
    const field =
      typeof body === 'object' && body !== null && 'field' in body ? body.field : undefined
    return typeof field === 'string' && isFormField(field) ? field : undefined
  } catch {
    // Corpo que não é JSON: fica só o toast com o código.
    return undefined
  }
}
