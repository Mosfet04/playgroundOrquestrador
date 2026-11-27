'use client'

import { useTranslations } from 'next-intl'

import { hasDescription, providerKey } from '@/lib/providerKey'
import { SelectItem } from '@/components/ui/select'
import { cn } from '@/lib/utils'

// Rótulo do provedor, o mesmo em todas as telas (QA1-11, #23): o do mapa
// `providers`, ou o valor como veio quando o orquestrador tem um provedor que
// o playground não conhece.
export function useProviderLabel() {
  const t = useTranslations('providers')
  return (raw: string) => {
    const key = providerKey(raw)
    return key ? t(`${key}.label`) : raw
  }
}

const SEPARATOR = ' · '

// `Rótulo · modelo` numa linha só; corta com reticências e o `title` traz o
// texto inteiro. O rótulo herda a fonte e a cor do lugar (o Chip é mono).
export function ProviderModel({
  provider,
  model,
  className
}: {
  provider?: string
  model?: string
  className?: string
}) {
  const providerLabel = useProviderLabel()
  const label = provider ? providerLabel(provider) : ''

  return (
    <span
      className={cn('truncate font-sans', className)}
      title={[label, model].filter(Boolean).join(SEPARATOR)}
    >
      {label}
      {label && model && <span className="text-muted-foreground">{SEPARATOR}</span>}
      {model && <span className="font-mono">{model}</span>}
    </span>
  )
}

// Item do dropdown de provedor: rótulo e id (o valor gravado), e nos pares que
// parecem provedores diferentes a descrição curta. O valor segue sendo o id.
export function ProviderSelectItem({ name }: { name: string }) {
  const t = useTranslations('providers')
  const providerLabel = useProviderLabel()
  const label = providerLabel(name)
  // Só os provedores que se confundem (`gemini`/`google`, `azure`/`azureopenai`).
  const key = providerKey(name)
  const description =
    key && hasDescription(key) ? t(`${key}.description`) : undefined

  return (
    <SelectItem value={name} description={description}>
      <span className="font-medium">{label}</span>
      {label !== name && (
        <>
          {' '}
          <span className="font-mono text-xs text-muted-foreground">
            {name}
          </span>
        </>
      )}
    </SelectItem>
  )
}
