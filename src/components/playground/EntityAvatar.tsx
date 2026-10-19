import { initials } from '@/lib/initials'
import { cn } from '@/lib/utils'

// Avatar da entidade com as iniciais sobre o gradiente da marca (cartão, lista,
// resposta e conversa vazia; docs/design/P1-06.md). Tamanho pelo className.
export function EntityAvatar({
  name,
  id,
  className
}: {
  name: string
  id: string
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-sm bg-gradient-to-br from-primary to-signal font-mono text-xs font-medium text-primary-foreground',
        className
      )}
    >
      {initials(name, id)}
    </span>
  )
}
