// @vitest-environment node
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// V16 (P1-01, decisão 0008): a regra de lint barra `next/font/google`.
// Usa a config real do repositório (eslint.config.mjs).
const lint = async (code: string) => {
  const eslint = new ESLint({ cwd: process.cwd() })
  const [result] = await eslint.lintText(code, {
    filePath: 'src/app/layout.tsx'
  })
  return result.messages.filter((m) => m.ruleId === 'no-restricted-imports')
}

describe('no-restricted-imports: next/font/google', () => {
  it('barra o import de next/font/google com a mensagem da decisão 0008', async () => {
    const messages = await lint(
      "import { Inter } from 'next/font/google'\nexport const font = Inter({ subsets: ['latin'] })\n"
    )
    expect(messages).toHaveLength(1)
    expect(messages[0].severity).toBe(2)
    expect(messages[0].message).toContain('decisão 0008')
  }, 30_000)

  it('aceita next/font/local', async () => {
    const messages = await lint(
      "import localFont from 'next/font/local'\nexport const font = localFont({ src: './a.woff2' })\n"
    )
    expect(messages).toEqual([])
  }, 30_000)
})
