import { TriangleAlert } from 'lucide-react'

// Aviso de campo (não bloqueia o envio): o valor segue editável e é enviado,
// o orquestrador decide (P3-02). `id` para o campo apontar em `aria-describedby`.
export function FieldWarning({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1 text-xs text-warning">
      <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}
