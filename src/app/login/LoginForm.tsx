'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  CircleAlert,
  Clock,
  Loader2,
  Unplug,
  type LucideIcon
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Chip } from '@/components/ui/loading'
import { cn } from '@/lib/utils'

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1)
})
type LoginValues = z.infer<typeof loginSchema>

// Um aviso por vez (o novo substitui o anterior); `id` remonta o role="alert"
// para anunciar de novo a cada envio.
type Notice = { id: number } & (
  | { kind: 'expired' }
  | { kind: 'invalid' }
  | { kind: 'tooMany'; retryAfter?: number }
  | { kind: 'unavailable'; status?: number }
)

// Retry-After em segundos (o do BFF); outro formato vale como ausente.
const parseRetryAfter = (header: string | null) => {
  const seconds = Number(header)
  return header && Number.isFinite(seconds) && seconds > 0
    ? Math.ceil(seconds)
    : undefined
}

// `{n} s` abaixo de 60 s, senão `{n} min` para cima: igual nos dois idiomas.
const formatWait = (seconds: number) =>
  seconds < 60 ? `${seconds} s` : `${Math.ceil(seconds / 60)} min`

type AuthTranslator = ReturnType<typeof useTranslations<'auth'>>

function noticeContent(
  notice: Notice,
  t: AuthTranslator
): { icon: LucideIcon; title: string; hint: string } {
  switch (notice.kind) {
    case 'expired':
      return { icon: Clock, title: t('expiredTitle'), hint: t('expiredHint') }
    case 'invalid':
      return {
        icon: CircleAlert,
        title: t('invalidTitle'),
        hint: t('invalidHint')
      }
    case 'tooMany':
      return {
        icon: Clock,
        title: t('tooManyTitle'),
        hint:
          notice.retryAfter === undefined
            ? t('retryLater')
            : t('retryIn', { wait: formatWait(notice.retryAfter) })
      }
    case 'unavailable':
      return {
        icon: Unplug,
        title: t('unavailableTitle'),
        hint: t('unavailableHint')
      }
  }
}

function FormNotice({ id, notice }: { id: string; notice: Notice }) {
  const t = useTranslations('auth')
  const tc = useTranslations('common')
  const error = notice.kind !== 'expired'
  const { icon: Icon, title, hint } = noticeContent(notice, t)

  return (
    <div
      id={id}
      role={error ? 'alert' : 'status'}
      className={cn(
        'flex gap-2 rounded-md border p-3 text-sm',
        error ? 'border-destructive bg-card' : 'border-border bg-muted'
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          'mt-0.5 size-4 shrink-0',
          error ? 'text-destructive' : 'text-muted-foreground'
        )}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-muted-foreground">{hint}</p>
        {notice.kind === 'unavailable' &&
          (notice.status === undefined ? (
            <Chip className="mt-1 self-start text-destructive">
              <span
                aria-hidden="true"
                className="size-2 rounded-full bg-current"
              />
              {tc('offline')}
            </Chip>
          ) : (
            <Chip className="mt-1 self-start">
              {tc('code', { status: notice.status })}
            </Chip>
          ))}
      </div>
    </div>
  )
}

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-center gap-1 text-xs text-destructive">
      <CircleAlert aria-hidden="true" className="size-3 shrink-0" />
      {children}
    </p>
  )
}

export function LoginForm({
  next,
  expired
}: {
  next: string
  expired: boolean
}) {
  const t = useTranslations('auth')
  const router = useRouter()
  const ids = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const sending = useRef(false)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(
    expired ? { id: 0, kind: 'expired' } : null
  )
  const {
    register,
    handleSubmit,
    setFocus,
    setValue,
    formState: { errors }
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' }
  })

  // Foco inicial no Usuário; na Senha se o navegador já preencheu o usuário.
  useEffect(() => {
    const username = formRef.current?.elements.namedItem('username')
    setFocus(
      username instanceof HTMLInputElement && username.value
        ? 'password'
        : 'username'
    )
  }, [setFocus])

  // 429 com prazo: "Entrar" volta quando ele acaba, e o aviso some.
  const blockedFor = notice?.kind === 'tooMany' ? notice.retryAfter : undefined
  useEffect(() => {
    if (blockedFor === undefined) return
    const timer = setTimeout(() => setNotice(null), blockedFor * 1000)
    return () => clearTimeout(timer)
  }, [blockedFor, notice?.id])

  const onSubmit = async (values: LoginValues) => {
    if (sending.current) return
    sending.current = true
    setPending(true)
    setNotice(null)
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values)
    }).catch(() => undefined)
    // Sucesso: segue ocupado até a navegação.
    if (response?.ok) {
      router.replace(next)
      return
    }
    sending.current = false
    setPending(false)
    const id = Date.now()
    if (response?.status === 401) {
      setNotice({ id, kind: 'invalid' })
      setValue('password', '')
      setFocus('password')
    } else if (response?.status === 429) {
      setNotice({
        id,
        kind: 'tooMany',
        retryAfter: parseRetryAfter(response.headers.get('Retry-After'))
      })
    } else {
      setNotice({ id, kind: 'unavailable', status: response?.status })
    }
  }

  const noticeId = `${ids}-notice`
  const usernameError = `${ids}-username-error`
  const passwordError = `${ids}-password-error`

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
    >
      {notice && <FormNotice key={notice.id} id={noticeId} notice={notice} />}

      <div className="space-y-2">
        <Label htmlFor={`${ids}-username`}>{t('username')}</Label>
        <Input
          id={`${ids}-username`}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          readOnly={pending}
          variant={errors.username ? 'destructive' : 'default'}
          aria-invalid={errors.username ? true : undefined}
          aria-describedby={errors.username ? usernameError : undefined}
          className="md:h-9"
          {...register('username')}
        />
        {errors.username && (
          <FieldError id={usernameError}>{t('usernameRequired')}</FieldError>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${ids}-password`}>{t('password')}</Label>
        <Input
          id={`${ids}-password`}
          type="password"
          autoComplete="current-password"
          readOnly={pending}
          variant={errors.password ? 'destructive' : 'default'}
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? passwordError : undefined}
          className="md:h-9"
          {...register('password')}
        />
        {errors.password && (
          <FieldError id={passwordError}>{t('passwordRequired')}</FieldError>
        )}
      </div>

      <Button
        type="submit"
        disabled={blockedFor !== undefined}
        aria-describedby={blockedFor !== undefined ? noticeId : undefined}
        aria-disabled={pending || undefined}
        aria-busy={pending || undefined}
        className="h-10 w-full aria-disabled:cursor-progress aria-disabled:opacity-50 md:h-9"
      >
        {pending && (
          <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />
        )}
        {pending ? t('submitting') : t('submit')}
      </Button>
    </form>
  )
}
