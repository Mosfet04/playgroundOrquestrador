import { type ReactNode } from 'react'
import { CircleCheck, CirclePause } from 'lucide-react'

import { Badge } from '@/components/ui/badge'

// StatusBadge do Design System: ícone e palavra; inativo é neutro, nunca vermelho.
export function StatusBadge({
  active,
  children
}: {
  active: boolean
  children: ReactNode
}) {
  const StatusIcon = active ? CircleCheck : CirclePause
  return (
    <Badge variant={active ? 'success' : 'neutral'}>
      <StatusIcon className="size-3" aria-hidden="true" />
      {children}
    </Badge>
  )
}
