import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

// IBM Plex servida de src/app/fonts (decisão 0008); licença em src/app/fonts/OFL.txt.
const plexSans = localFont({
  src: [
    {
      path: './fonts/IBMPlexSans-Regular.woff2',
      weight: '400',
      style: 'normal'
    },
    {
      path: './fonts/IBMPlexSans-Italic.woff2',
      weight: '400',
      style: 'italic'
    },
    {
      path: './fonts/IBMPlexSans-Medium.woff2',
      weight: '500',
      style: 'normal'
    },
    {
      path: './fonts/IBMPlexSans-SemiBold.woff2',
      weight: '600',
      style: 'normal'
    }
  ],
  variable: '--font-sans',
  display: 'swap'
})

const plexMono = localFont({
  src: [
    {
      path: './fonts/IBMPlexMono-Regular.woff2',
      weight: '400',
      style: 'normal'
    },
    { path: './fonts/IBMPlexMono-Medium.woff2', weight: '500', style: 'normal' }
  ],
  variable: '--font-mono',
  display: 'swap'
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1
}

export const metadata: Metadata = {
  title: 'Agent UI',
  description:
    'A modern chat interface for AI agents built with Next.js, Tailwind CSS, and TypeScript. This template provides a ready-to-use UI for interacting with Agno agents.'
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body
        className={`${plexSans.variable} ${plexMono.variable} font-sans antialiased`}
      >
        <NuqsAdapter>{children}</NuqsAdapter>
        <Toaster />
      </body>
    </html>
  )
}
