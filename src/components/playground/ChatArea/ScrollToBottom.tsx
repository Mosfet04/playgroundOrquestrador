'use client'

import type React from 'react'

import { motion, AnimatePresence } from 'framer-motion'
import { useStickToBottomContext } from 'use-stick-to-bottom'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'

const ScrollToBottom: React.FC = () => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext()
  const t = useTranslations('playground')

  return (
    <AnimatePresence>
      {!isAtBottom && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2"
        >
          <Button
            onClick={() => scrollToBottom()}
            type="button"
            size="icon"
            variant="secondary"
            className="border border-border bg-background text-foreground shadow-popover transition-shadow duration-300 hover:bg-accent"
            aria-label={t('scrollToBottom')}
          >
            <Icon type="arrow-down" size="xs" />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default ScrollToBottom
