import * as React from 'react'

import { cn } from '@/lib/utils'

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  className?: string
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
}

// O mínimo e o teto são classes (`min-h-10` e `max-h-24` por padrão; o composer
// e as Instruções passam os deles) e o autoajuste lê o min-height e o
// max-height calculados (P2-03, P3-06).
const TextArea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, value, onChange, ...props }, forwardedRef) => {
    const [showScroll, setShowScroll] = React.useState(false)
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)

    const adjustHeight = React.useCallback(() => {
      const textarea = textareaRef.current
      if (!textarea) return

      const computed = getComputedStyle(textarea)
      const minHeight = parseFloat(computed.minHeight) || 0
      // `none` (sem teto) não é número.
      const maxHeight = parseFloat(computed.maxHeight) || Infinity
      textarea.style.height = `${minHeight}px`
      const { scrollHeight } = textarea
      const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight)
      textarea.style.height = `${newHeight}px`
      setShowScroll(scrollHeight > maxHeight)
    }, [])

    const handleChange = React.useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const cursorPosition = e.target.selectionStart
        onChange?.(e)
        requestAnimationFrame(() => {
          adjustHeight()
          if (textareaRef.current) {
            textareaRef.current.setSelectionRange(
              cursorPosition,
              cursorPosition
            )
          }
        })
      },
      [onChange, adjustHeight]
    )

    const handleRef = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        const ref = forwardedRef as
          | React.MutableRefObject<HTMLTextAreaElement | null>
          | ((instance: HTMLTextAreaElement | null) => void)
          | null

        if (typeof ref === 'function') {
          ref(node)
        } else if (ref) {
          ref.current = node
        }

        textareaRef.current = node
      },
      [forwardedRef]
    )

    React.useEffect(() => {
      if (textareaRef.current) {
        adjustHeight()
      }
    }, [value, adjustHeight])

    return (
      <textarea
        className={cn(
          'max-h-24 min-h-10 w-full resize-none bg-transparent',
          'rounded-md border border-input',
          'px-3 py-2',
          'text-base leading-5 md:text-sm',
          'placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:border-primary focus-visible:shadow-glow',
          'disabled:cursor-not-allowed disabled:opacity-50',
          showScroll ? 'overflow-y-auto' : 'overflow-hidden',
          className
        )}
        ref={handleRef}
        value={value}
        onChange={handleChange}
        {...props}
      />
    )
  }
)

TextArea.displayName = 'TextArea'

export type { TextareaProps }
export { TextArea }
