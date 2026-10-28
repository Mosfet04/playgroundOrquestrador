import { cn } from '@/lib/utils'

// Cartão marcável (P3-04): checkbox ou rádio nativo (`accent-primary`) numa
// linha que se destaca marcada (`border-primary bg-primary-soft`). O rótulo
// (nome e id) estica sobre o cartão: a linha inteira é o alvo do clique; a
// descrição fica fora do rótulo e entra no `aria-describedby`.
export function OptionCard({
  id,
  type,
  name,
  value,
  checked,
  disabled,
  onChange,
  inputRef,
  describedBy,
  invalid,
  label,
  description,
  aside,
  children
}: {
  id: string
  type: 'checkbox' | 'radio'
  name?: string
  value?: string
  checked: boolean
  disabled?: boolean
  onChange: () => void
  inputRef?: React.Ref<HTMLInputElement>
  /** Ids extras (erro, aviso) além da descrição. */
  describedBy?: string
  invalid?: boolean
  label: React.ReactNode
  description?: string
  /** À direita do rótulo (ex.: "Padrão"). */
  aside?: React.ReactNode
  /** Abaixo da descrição (aviso do cartão). */
  children?: React.ReactNode
}) {
  const descriptionId = `${id}-description`
  const describedByIds = [description ? descriptionId : '', describedBy ?? ''].filter(Boolean).join(' ')
  return (
    <div
      className={cn(
        'relative flex min-w-0 items-start gap-3 rounded-lg border bg-card p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring max-md:min-h-11',
        checked ? 'border-primary bg-primary-soft' : 'border-border hover:bg-muted',
        disabled && 'cursor-not-allowed opacity-60'
      )}
    >
      <input
        ref={inputRef}
        id={id}
        type={type}
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-describedby={describedByIds || undefined}
        aria-invalid={invalid || undefined}
        className="relative z-10 mt-0.5 size-4 shrink-0 accent-primary"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <label
            htmlFor={id}
            className={cn(
              'min-w-0 font-medium after:absolute after:inset-0',
              disabled ? 'cursor-not-allowed' : 'cursor-pointer'
            )}
          >
            {label}
          </label>
          {aside}
        </div>
        {description && (
          <p id={descriptionId} className="line-clamp-2 text-xs text-muted-foreground">
            {description}
          </p>
        )}
        {children}
      </div>
    </div>
  )
}
