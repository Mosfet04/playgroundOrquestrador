import type { Config } from 'tailwindcss'
import tailwindcssAnimate from 'tailwindcss-animate'

// Tokens do Design System (docs/design/design-system.md, "Nomes no código").
// Os valores ficam em src/app/globals.css (:root = claro, .dark = escuro).
const token = (name: string) => `hsl(var(--${name}))`
const withForeground = (name: string) => ({
  DEFAULT: token(name),
  foreground: token(`${name}-foreground`)
})

export default {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        background: token('background'),
        foreground: token('foreground'),
        border: token('border'),
        input: token('input'),
        ring: token('ring'),
        signal: token('signal'),
        success: token('success'),
        warning: token('warning'),
        card: withForeground('card'),
        popover: withForeground('popover'),
        secondary: withForeground('secondary'),
        muted: withForeground('muted'),
        accent: withForeground('accent'),
        destructive: withForeground('destructive'),
        primary: { ...withForeground('primary'), soft: token('primary-soft') }
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: [
          'var(--font-mono)',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace'
        ]
      },
      letterSpacing: {
        tight: '-0.01em',
        widest: '0.08em'
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      boxShadow: {
        popover: 'var(--shadow-popover)',
        dialog: 'var(--shadow-dialog)',
        glow: 'var(--shadow-glow)'
      }
    }
  },
  plugins: [tailwindcssAnimate]
} satisfies Config
