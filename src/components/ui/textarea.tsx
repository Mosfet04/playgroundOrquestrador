import * as React from 'react'

import { cn } from '@/lib/utils'

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  className?: string
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
}

const MIN_HEIGHT = 40
const MAX_HEIGHT = 96

const TextArea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, value, onChange, ...props }, forwardedRef) => {
    const [showScroll, setShowScroll] = React.useState(false)
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)

    const adjustHeight = React.useCallback(() => {
      const textarea = textareaRef.current
      if (!textarea) return

      textarea.style.height = `${MIN_HEIGHT}px`
      const { scrollHeight } = textarea
      const newHeight = Math.min(Math.max(scrollHeight, MIN_HEIGHT), MAX_HEIGHT)
      textarea.style.height = `${newHeight}px`
      setShowScroll(scrollHeight > MAX_HEIGHT)
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
          'w-full resize-none bg-transparent',
          'rounded-md border border-input',
          'px-3 py-2',
          'text-base leading-5 md:text-sm',
          'placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:border-primary focus-visible:shadow-glow',
          'disabled:cursor-not-allowed disabled:opacity-50',
          showScroll ? 'overflow-y-auto' : 'overflow-hidden',
          className
        )}
        style={{
          minHeight: `${MIN_HEIGHT}px`,
          height: `${MIN_HEIGHT}px`,
          maxHeight: `${MAX_HEIGHT}px`
        }}
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
