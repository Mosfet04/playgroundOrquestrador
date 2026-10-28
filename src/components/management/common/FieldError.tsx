// Erro de um campo do editor (texto do catálogo), no padrão dos erros de
// validação do formulário.
// `id`: para o campo apontar o erro em `aria-describedby`.
export function FieldError({ message, id }: { message?: string; id?: string }) {
  if (!message) return null
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  )
}
