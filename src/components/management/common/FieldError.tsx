import type { ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'

// Slot de erro de um campo (QA1-05): fica sempre montado, com a altura de uma
// linha (`min-h-5`), para o erro aparecer e sumir sem mover o campo seguinte.
// `id` (`<campo>-error`): o controle o aponta em `aria-describedby` (errorA11y).
// `aria-live`: a mensagem é anunciada ao aparecer, sem tirar o foco.
export function FieldError({ message, id }: { message?: ReactNode; id?: string }) {
  return (
    <p id={id} aria-live="polite" className="flex min-h-5 items-start gap-1 text-sm text-destructive">
      {message && (
        <>
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{message}</span>
        </>
      )}
    </p>
  )
}

// `aria-invalid` e `aria-describedby` do controle de `id`: a ajuda e os avisos
// (`describedBy`) e, por último, o slot `<id>-error`, que existe vazio quando o
// campo é válido. O estilo de erro do controle vem de `aria-invalid`.
export function errorA11y(id: string, invalid: boolean, ...describedBy: (string | false | undefined)[]) {
  return {
    'aria-invalid': invalid || undefined,
    'aria-describedby': [...describedBy, `${id}-error`].filter(Boolean).join(' ')
  }
}
