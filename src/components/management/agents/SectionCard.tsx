import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

// Card de uma seção do editor de agent: região nomeada pelo título.
export function SectionCard({
  id,
  title,
  description,
  busy,
  children
}: {
  id: string
  title: string
  description: string
  busy?: boolean
  children: React.ReactNode
}) {
  return (
    <Card role="region" aria-labelledby={id} aria-busy={busy || undefined}>
      <CardHeader>
        <CardTitle id={id}>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}
