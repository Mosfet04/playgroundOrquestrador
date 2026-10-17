// @vitest-environment node
import { ESLint } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'

// QA P1-04 (critério: regra de lint para texto literal em JSX). Roda a config
// real do projeto sobre trechos e confirma que a regra pega o texto fixo nas
// pastas migradas e deixa passar o catálogo. P1-04b: a regra vale também no
// playground, nos hooks e no store, e fecha as lacunas R8 (template literal em
// ternário, ternário nos atributos lidos, literal a mais de 2 níveis) e o texto
// fixo em toast.*() e setStreamingErrorMessage() (argumentos e valores de
// objeto nesses argumentos). Lacuna conhecida: prop de componente próprio com
// texto (`<ActionButton text="..." />`) passa, por causa do `ignoreProps`.
// Outra lacuna conhecida (R11): `toast(t('x'), { action: { label: 'Desfazer' } })`
// passa, porque o laço da regra retorna na primeira chave que não está em
// `TEXT_KEY` e nunca chega ao `label` do objeto.

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
  'src/app/(app)/foo/page.tsx',
  'src/components/playground/ChatArea/Foo.tsx',
  'src/hooks/useFoo.tsx'
]
const UI_TEXT = 'ui-text/no-literal'
const PLAYGROUND = 'src/components/playground/Sidebar/Foo.tsx'
const count = (found: string[], rule: string) => found.filter((r) => r === rule).length

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
    // 'N/D' (||), 'Sim' (1º nível) e 'Talvez' + 'Não' (ternário aninhado, 2º nível)
    expect(count(await messages(code, MIGRATED[0]), UI_TEXT)).toBe(4)
  })

  it('texto vindo do catálogo, separadores permitidos e props de estilo passam', async () => {
    const code = `export const A = ({ t }: { t: (k: string) => string }) => (
  <p className="text-sm" aria-label={t('a')} placeholder={t('b')}>{t('c')} › {t('d')}:</p>
)\n`
    expect(await messages(code, MIGRATED[0])).toEqual([])
  })

  it('fora das pastas migradas a regra não vale', async () => {
    expect(
      await messages(`export const A = () => <p>Send</p>\n`, 'src/components/ui/Foo.tsx')
    ).not.toContain('react/jsx-no-literals')
  })
})

describe('R8: lacunas fechadas no P1-04b', () => {
  it('template literal com texto dentro de ternário, nos filhos JSX, é erro', async () => {
    const code = `export const A = ({ x, n }: { x: boolean; n: number }) => (
  <p>{x ? \`Passo \${n}\` : null}</p>
)\n`
    expect(count(await messages(code, PLAYGROUND), UI_TEXT)).toBe(1)
  })

  it.each(['aria-label', 'placeholder', 'title', 'alt'])(
    'ternário com texto no atributo %s é erro',
    async (attribute) => {
      const code = `export const A = ({ x }: { x: boolean }) => (
  <input ${attribute}={x ? 'Expandir' : 'Recolher'} />
)\n`
      expect(count(await messages(code, PLAYGROUND), UI_TEXT)).toBe(2)
    }
  )

  it('literal ou template literal em {} no atributo lido é erro', async () => {
    const code = `export const A = ({ n }: { n: string }) => (
  <><img alt={'Imagem'} src="x" /><button aria-label={\`Excluir \${n}\`} /></>
)\n`
    expect(count(await messages(code, PLAYGROUND), UI_TEXT)).toBe(2)
  })

  it('literal a mais de 2 níveis de ?:/||/&& é erro', async () => {
    const code = `export const A = ({ a, b, c, d }: { a: boolean; b: boolean; c: boolean; d?: string }) => (
  <p>{a ? null : b ? null : c ? (d || 'Fundo') : null}</p>
)\n`
    expect(count(await messages(code, PLAYGROUND), UI_TEXT)).toBe(1)
  })

  it('texto fixo em toast.*() e em setStreamingErrorMessage() é erro, também em ternário', async () => {
    const code = `import { toast } from 'sonner'
declare const setStreamingErrorMessage: (v: unknown) => void
export function f(x: boolean, e: string) {
  toast.error('Falhou')
  toast.success(\`Excluída \${e}\`)
  toast(x ? 'Sim' : 'Não')
  setStreamingErrorMessage('Selecione um agente')
}\n`
    expect(count(await messages(code, 'src/hooks/useFoo.ts'), UI_TEXT)).toBe(5)
  })

  it('texto fixo em objeto passado a toast.*() e a setStreamingErrorMessage() é erro', async () => {
    const code = `import { toast } from 'sonner'
declare const setStreamingErrorMessage: (v: unknown) => void
declare const t: (k: string) => string
export function f(p: Promise<void>) {
  toast.error(t('x'), { description: 'Falhou feio' })
  toast.promise(p, { loading: 'Carregando', error: t('e') })
  setStreamingErrorMessage({ kind: 'runError', detail: 'Texto fixo' })
}\n`
    expect(count(await messages(code, 'src/hooks/useFoo.ts'), UI_TEXT)).toBe(3)
  })

  it('passam: chaves que não são texto (id, kind, position, className) e toast.dismiss() com id', async () => {
    const code = `import { toast } from 'sonner'
declare const setStreamingErrorMessage: (v: unknown) => void
declare const t: (k: string) => string
export function f() {
  toast.dismiss('download')
  toast.loading(t('x'), { id: 'download' })
  toast.error(t('x'), { position: 'top-center', className: 'bg-muted', classNames: { toast: 'border' } })
  setStreamingErrorMessage({ kind: 'network' })
}\n`
    expect(await messages(code, 'src/hooks/useFoo.ts')).toEqual([])
  })

  it('o store também está coberto', async () => {
    const code = `declare const setStreamingErrorMessage: (v: unknown) => void
setStreamingErrorMessage('Erro')\n`
    expect(count(await messages(code, 'src/store.ts'), UI_TEXT)).toBe(1)
  })

  it('passam: className em ternário, chave do catálogo em ternário, comparação e o tipo do erro', async () => {
    const code = `import { toast } from 'sonner'
declare const setStreamingErrorMessage: (v: unknown) => void
export const A = ({ t, x, mode }: { t: (k: string) => string; x: boolean; mode: string }) => {
  toast.error(t(x ? 'a' : 'b'))
  setStreamingErrorMessage({ kind: 'network' })
  return (
    <p className={x ? 'rotate-180' : 'rotate-0'} aria-label={x ? t('expand') : t('collapse')}>
      {mode === 'team' && t('team')}
      {x ? t('a') : t('b')}
      {x && <span className={x ? 'bg-muted' : 'bg-accent'}>{t('c')}</span>}
    </p>
  )
}\n`
    expect(await messages(code, PLAYGROUND)).toEqual([])
  })
})
