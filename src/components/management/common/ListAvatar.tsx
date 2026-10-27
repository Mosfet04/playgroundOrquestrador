import { cn } from '@/lib/utils'

// Avatar de 28 px das listas (agents e teams): iniciais sobre o gradiente da
// marca; inativo em `secondary`.
export function ListAvatar({ name, active }: { name: string; active: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join('')
    .toUpperCase()
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-sm font-mono text-xs font-medium',
        active
          ? 'bg-gradient-to-br from-primary to-signal text-primary-foreground'
          : 'bg-secondary text-secondary-foreground'
      )}
    >
      {initials}
    </span>
  )
}
