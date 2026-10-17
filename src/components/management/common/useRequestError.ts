import { useTranslations } from 'next-intl'

type ErrorMessages = { failed: string; conflict?: string; notFound?: string }

// Texto que vem do BFF não aparece na UI (P1-04): o erro é do catálogo,
// escolhido pela ação e pelo status HTTP. 409 e 404 têm mensagem própria; os
// outros levam o código. Sem status (falha de rede), só a mensagem da ação.
export function useRequestError() {
  const t = useTranslations('common')
  return (status: number | undefined, messages: ErrorMessages) => {
    if (status === 409 && messages.conflict) return messages.conflict
    if (status === 404 && messages.notFound) return messages.notFound
    if (status === undefined) return messages.failed
    return t('withCode', { message: messages.failed, status })
  }
}
