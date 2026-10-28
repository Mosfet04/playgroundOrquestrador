// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// P1-05 (QA): documentação fiel ao que existe. Sem as promessas falsas do
// README antigo e sem link para os três docs apagados (D-P1-05-3).

const root = process.cwd()
const read = (file: string) => readFileSync(resolve(root, file), 'utf8')

const readme = read('README.md')
const contributing = read('CONTRIBUTING.md')
const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> }
const catalogs = [read('messages/pt-BR.json'), read('messages/en.json')]

const DELETED = ['README_EN.md', 'README_AGNO_MANAGER.md', 'INTEGRATION.md']

describe('os três docs apagados (D-P1-05-3)', () => {
  it.each(DELETED)('%s não existe mais', (file) => {
    expect(existsSync(resolve(root, file))).toBe(false)
  })

  it.each(['README.md', 'CONTRIBUTING.md', 'CLAUDE.md'])('%s não aponta para eles', (file) => {
    const text = read(file)
    for (const name of DELETED) expect(text, `${file} cita ${name}`).not.toContain(name)
  })
})

const NEXT_14: [string, RegExp] = ['Next 14', /next(\.js)?\s*14/i]
const FORMS_ZOD: [string, RegExp] = [
  'Zod como validação dos formulários',
  /react hook form\s*\+\s*zod|forms?\*{0,2}:.*zod/i
]
const README_ONLY: [string, RegExp][] = [
  ['hot reload', /hot[\s-]?reload/i],
  ['"disponível imediatamente"', /dispon[ií]ve(l|is)\s+imediatamente|available immediately/i]
]

// "hot reload" e "imediatamente" nos catálogos já são barrados por
// tests/i18n/glossary.test.ts; aqui os catálogos só conferem Next 14 e Zod.
describe('README e textos de UI sem as promessas falsas', () => {
  it.each([NEXT_14, FORMS_ZOD, ...README_ONLY])('README não promete %s', (_name, pattern) => {
    expect(readme).not.toMatch(pattern)
  })

  it.each([NEXT_14, FORMS_ZOD])('catálogos não prometem %s', (_name, pattern) => {
    for (const catalog of catalogs) expect(catalog).not.toMatch(pattern)
  })

  it('a versão do Next citada no README é a instalada', () => {
    const major = pkg.dependencies.next.match(/\d+/)?.[0]
    const cited = [...readme.matchAll(/Next\.js (\d+)/g)].map((m) => m[1])
    expect(cited.length).toBeGreaterThan(0)
    for (const version of cited) expect(version).toBe(major)
  })

  // P2-06 (D-P2-06-5): a API Admin aplica a mudança ao salvar; sem Mongo no playground.
  it('diz que a mudança vale no chat logo depois de salvar (pt-BR e EN), sem mandar reiniciar', () => {
    expect(readme).toMatch(/vale no chat \*{0,2}logo depois de salvar/i)
    expect(readme).toMatch(/takes effect in chat \*{0,2}right after saving/i)
    expect(readme).not.toMatch(/reinici\w* o orquestrador|restart\w* the orchestrator/i)
  })

  it('não pede env nem script do Mongo (MONGO_*, mongosh)', () => {
    expect(readme).not.toMatch(/MONGO_|mongosh|sample-data\.js/)
  })

  it('não promete env que nada lê (MONGODB_URI)', () => {
    expect(readme).not.toContain('MONGODB_URI')
  })

  // `docker run` para subir o Mongo local é legítimo; o que não pode é o README
  // mandar buildar/compor a aplicação sem o arquivo existir.
  it('se o README manda usar docker-compose ou docker build, o arquivo existe', () => {
    if (/docker[- ]compose/i.test(readme))
      expect(
        ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'].some((f) =>
          existsSync(resolve(root, f))
        )
      ).toBe(true)
    if (/docker build/i.test(readme)) expect(existsSync(resolve(root, 'Dockerfile'))).toBe(true)
  })
})

describe('links relativos do README e do CONTRIBUTING', () => {
  const links = (file: string, text: string) =>
    [...text.matchAll(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g)].map((m) => ({
      file,
      target: m[1].split('#')[0]
    }))

  const all = [...links('README.md', readme), ...links('CONTRIBUTING.md', contributing)]

  it('há links para conferir', () => {
    expect(all.length).toBeGreaterThan(3)
  })

  it.each(all.map((l) => [l.file, l.target]))('%s → %s existe', (file, target) => {
    expect(existsSync(resolve(root, dirname(file), target))).toBe(true)
  })
})

describe('CONTRIBUTING aponta para o /dev-cycle', () => {
  it('cita o comando (a skill é conferida pelos links relativos)', () => {
    expect(contributing).toContain('/dev-cycle')
  })
})
