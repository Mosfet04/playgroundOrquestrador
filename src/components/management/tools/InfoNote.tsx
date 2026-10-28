import { Info } from 'lucide-react'

// Nota fixa de ajuda (não é aviso): ícone de informação e texto discreto.
export function InfoNote({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1 text-xs text-muted-foreground">
      <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}
