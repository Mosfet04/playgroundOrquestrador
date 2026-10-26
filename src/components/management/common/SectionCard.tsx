import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

// Card de uma seção do editor (agent e tool): região nomeada pelo título.
export function SectionCard({
  id,
  title,
  description,
  busy,
  action,
  className,
  tabIndex,
  children
}: {
  id: string
  title: string
  description: string
  busy?: boolean
  // Botão à direita do título (empilha abaixo de `md`).
  action?: React.ReactNode
  className?: string
  tabIndex?: number
  children: React.ReactNode
}) {
  return (
    <Card
      role="region"
      aria-labelledby={id}
      aria-busy={busy || undefined}
      tabIndex={tabIndex}
      className={className}
    >
      <CardHeader>
        {action ? (
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 space-y-1.5">
              <CardTitle id={id}>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
            {action}
          </div>
        ) : (
          <>
            <CardTitle id={id}>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </>
        )}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}
