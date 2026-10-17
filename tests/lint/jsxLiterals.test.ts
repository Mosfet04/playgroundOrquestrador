// @vitest-environment node
import { ESLint } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'

// QA P1-04 (critério: regra de lint para texto literal em JSX). Roda a config
// real do projeto sobre trechos e confirma que a regra pega o texto fixo nas
// pastas migradas e deixa passar o catálogo. Lacunas conhecidas (template
// literal, ternário em atributo, 3+ níveis) estão registradas no P1-04b, em
// docs/roadmap/P1-design-navegacao.md (Riscos e dependências, R8).

let eslint: ESLint
beforeAll(() => {
  eslint = new ESLint({ cwd: process.cwd() })
}, 30_000)

async function messages(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.map((m) => `${m.ruleId}`)
}

const MIGRATED = [
  'src/components/management/x/Foo.tsx',
  'src/components/layout/Foo.tsx',
  'src/app/(app)/foo/page.tsx'
]

describe('regra de texto literal em JSX', () => {
  it.each(MIGRATED)('%s: texto solto no JSX é erro', async (file) => {
    expect(await messages(`export const A = () => <p>Salvar</p>\n`, file)).toContain(
      'react/jsx-no-literals'
    )
  })

  it('string em {} no JSX é erro', async () => {
    expect(
      await messages(`export const A = () => <p>{'Salvar'}</p>\n`, MIGRATED[0])
    ).toContain('react/jsx-no-literals')
  })

  it.each(['aria-label', 'placeholder', 'title', 'alt'])(
    'atributo %s literal é erro',
    async (attribute) => {
      expect(
        await messages(`export const A = () => <input ${attribute}="Buscar" />\n`, MIGRATED[0])
      ).toContain('no-restricted-syntax')
    }
  )

  it('fallback literal em || e em ?: aninhado (até 2 níveis) é erro', async () => {
    const code = `export const A = ({ x, y, z }: { x?: string; y?: boolean; z?: boolean }) => (
  <p>{x || 'N/D'}{y ? 'Sim' : z ? 'Talvez' : 'Não'}</p>
)\n`
    const found = await messages(code, MIGRATED[0])
    // 'N/D' (||), 'Sim' (1º nível) e 'Talvez' + 'Não' (ternário aninhado, 2º nível)
    expect(found.filter((rule) => rule === 'no-restricted-syntax')).toHaveLength(4)
  })

  it('texto vindo do catálogo, separadores permitidos e props de estilo passam', async () => {
    const code = `export const A = ({ t }: { t: (k: string) => string }) => (
  <p className="text-sm" aria-label={t('a')} placeholder={t('b')}>{t('c')} › {t('d')}:</p>
)\n`
    expect(await messages(code, MIGRATED[0])).toEqual([])
  })

  it('fora das pastas migradas (playground, P1-04b) a regra não vale', async () => {
    expect(
      await messages(`export const A = () => <p>Send</p>\n`, 'src/components/playground/Foo.tsx')
    ).not.toContain('react/jsx-no-literals')
  })
})
