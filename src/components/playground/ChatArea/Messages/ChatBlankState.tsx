'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { motion, Variants } from 'framer-motion'
import Icon from '@/components/ui/icon'
import { IconType } from '@/components/ui/icon/types'
import React, { useState } from 'react'

const EXTERNAL_LINKS = {
  documentation: 'https://agno.link/agent-ui',
  playground: 'https://app.agno.com/playground/agents',
  agno: 'https://agno.com'
}

const TECH_ICONS = [
  {
    type: 'nextjs' as IconType,
    position: 'left-0',
    link: 'https://nextjs.org',
    name: 'Next.js',
    zIndex: 10
  },
  {
    type: 'shadcn' as IconType,
    position: 'left-[15px]',
    link: 'https://ui.shadcn.com',
    name: 'shadcn/ui',
    zIndex: 20
  },
  {
    type: 'tailwind' as IconType,
    position: 'left-[30px]',
    link: 'https://tailwindcss.com',
    name: 'Tailwind CSS',
    zIndex: 30
  }
]

interface ActionButtonProps {
  href: string
  variant?: 'primary'
  text: string
}

const ActionButton = ({ href, variant, text }: ActionButtonProps) => {
  const baseStyles =
    'px-4 py-2 text-sm transition-colors font-mono tracking-tight'
  const variantStyles = {
    primary: 'border border-border hover:bg-accent rounded-md'
  }

  return (
    <Link
      href={href}
      target="_blank"
      className={`${baseStyles} uppercase ${variant ? variantStyles[variant] : ''}`}
    >
      {text}
    </Link>
  )
}

const ChatBlankState = () => {
  const [hoveredIcon, setHoveredIcon] = useState<string | null>(null)
  const t = useTranslations('playground')

  // Animation variants for the icon
  const iconVariants: Variants = {
    initial: { y: 0 },
    hover: {
      y: -8,
      transition: {
        type: 'spring',
        stiffness: 150,
        damping: 10,
        mass: 0.5
      }
    },
    exit: {
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 200,
        damping: 15,
        mass: 0.6
      }
    }
  }

  // Animation variants for the tooltip
  const tooltipVariants: Variants = {
    hidden: {
      opacity: 0,
      transition: {
        duration: 0.15,
        ease: 'easeInOut'
      }
    },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.15,
        ease: 'easeInOut'
      }
    }
  }

  return (
    <section
      className="flex flex-col items-center text-center font-sans"
      aria-label={t('welcomeLabel')}
    >
      <div className="flex max-w-3xl flex-col gap-y-8">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-3xl font-[600] tracking-tight"
        >
          <div className="flex flex-wrap items-center justify-center gap-x-2 px-4 font-[600] lg:flex-nowrap lg:whitespace-nowrap lg:px-0">
            {t.rich('welcome', {
              // A pontuação logo depois da marca (a vírgula do pt-BR) vem dentro
              // da tag, no mesmo item do flex, sem o gap antes dela.
              agno: (punctuation) => (
                <span className="inline-flex items-center">
                  <span className="inline-flex translate-y-[10px] scale-125 items-center transition-transform duration-200 hover:rotate-6">
                    <Link
                      href={EXTERNAL_LINKS.agno}
                      target="_blank"
                      rel="noopener"
                      className="cursor-pointer"
                    >
                      <Icon type="agno-tag" size="default" />
                    </Link>
                  </span>
                  {punctuation}
                </span>
              ),
              stack: () => (
                <span className="inline-flex translate-y-[5px] scale-125 items-center">
                  <div className="relative ml-2 h-[40px] w-[90px]">
                    {TECH_ICONS.map((icon) => (
                      <motion.div
                        key={icon.type}
                        className={`absolute ${icon.position} top-0`}
                        style={{ zIndex: icon.zIndex }}
                        variants={iconVariants}
                        initial="initial"
                        whileHover="hover"
                        animate={hoveredIcon === icon.type ? 'hover' : 'exit'}
                        onHoverStart={() => setHoveredIcon(icon.type)}
                        onHoverEnd={() => setHoveredIcon(null)}
                      >
                        <Link
                          href={icon.link}
                          target="_blank"
                          rel="noopener"
                          className="relative block cursor-pointer"
                        >
                          <div>
                            <Icon type={icon.type} size="default" />
                          </div>
                          <motion.div
                            className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 transform whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-popover"
                            variants={tooltipVariants}
                            initial="hidden"
                            animate={
                              hoveredIcon === icon.type ? 'visible' : 'hidden'
                            }
                          >
                            {icon.name}
                          </motion.div>
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                </span>
              )
            })}
          </div>
          <p>{t('welcomeHint')}</p>
        </motion.h1>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="flex flex-wrap justify-center gap-4"
        >
          <ActionButton
            href={EXTERNAL_LINKS.documentation}
            variant="primary"
            text={t('goToDocs')}
          />
          <ActionButton
            href={EXTERNAL_LINKS.playground}
            text={t('visitAgentPlayground')}
          />
        </motion.div>
      </div>
    </section>
  )
}

export default ChatBlankState
