'use client'

import { useTheme } from 'next-themes'
import { useTranslations } from 'next-intl'
import { Toaster as Sonner } from 'sonner'

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme()
  const t = useTranslations('common')

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      containerAriaLabel={t('notifications')}
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:rounded-lg group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:border-border group-[.toaster]:shadow-popover',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton:
            'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground'
        }
      }}
      {...props}
    />
  )
}

export { Toaster }
