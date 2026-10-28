// @vitest-environment node
import { execFile, execSync } from 'node:child_process'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// P2-02: `pnpm contract:check` regenera os tipos a partir do snapshot e falha
// se divergirem dos versionados. Roda o comando do package.json sobre cópias
// do snapshot e dos tipos (nada no repo é reescrito).

const root = process.cwd()
const SNAPSHOT = 'docs/contracts/orchestrator-openapi.json'
const TYPES = 'src/server/orchestrator/openapi.d.ts'
const script = (
  JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
  }
).scripts['contract:check']

let dir: string
let snapshot: string
let types: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'contract-check-'))
  snapshot = join(dir, 'openapi.json')
  types = join(dir, 'openapi.d.ts')
  copyFileSync(resolve(root, SNAPSHOT), snapshot)
  copyFileSync(resolve(root, TYPES), types)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const contractCheck = () => {
  try {
    execSync(script.replace(SNAPSHOT, snapshot).replace(TYPES, types), {
      cwd: root,
      stdio: 'pipe',
      env: {
        ...process.env,
        PATH: `${resolve(root, 'node_modules/.bin')}${delimiter}${process.env.PATH}`
      }
    })
    return 0
  } catch (error) {
    return (error as { status: number }).status
  }
}

describe('contract:check', () => {
  it('lê o snapshot e os tipos versionados', () => {
    expect(script).toContain(SNAPSHOT)
    expect(script).toContain(TYPES)
  })

  it('passa com os tipos em dia com o snapshot', () => {
    expect(contractCheck()).toBe(0)
  }, 30_000)

  it('falha com snapshot divergente, sem reescrever os tipos', () => {
    const spec = JSON.parse(readFileSync(snapshot, 'utf8')) as {
      paths: Record<string, unknown>
    }
    spec.paths['/rota-nova'] = { get: { responses: { 200: { description: 'ok' } } } }
    writeFileSync(snapshot, JSON.stringify(spec))
    const before = readFileSync(types, 'utf8')

    expect(contractCheck()).not.toBe(0)
    expect(readFileSync(types, 'utf8')).toBe(before)
  }, 30_000)

  it('falha com os tipos editados à mão', () => {
    writeFileSync(types, `${readFileSync(types, 'utf8')}\nexport type Extra = 1\n`)

    expect(contractCheck()).not.toBe(0)
  }, 30_000)
})

// Com as chaves ligadas, o /openapi.json do orquestrador em development pede a
// chave run: o script a manda se estiver no env e explica o 401/403 sem ecoá-la.
describe('contract:update', () => {
  const KEY = 'chave-run-de-teste'

  const runUpdate = async (status: number, env: Record<string, string>) => {
    const seen: (string | undefined)[] = []
    const fake = createServer((req, res) => {
      seen.push(req.headers.authorization)
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end('{"detail":"unauthorized"}')
    })
    await new Promise<void>((done) => fake.listen(0, '127.0.0.1', done))
    const { port } = fake.address() as AddressInfo
    const output = await new Promise<{ code: number; text: string }>((done) => {
      execFile(
        process.execPath,
        ['scripts/contract-update.mts'],
        {
          cwd: root,
          env: { ...process.env, ORCHESTRATOR_URL: `http://127.0.0.1:${port}`, ...env }
        },
        (error, stdout, stderr) =>
          done({ code: error ? Number(error.code) : 0, text: stdout + stderr })
      )
    })
    fake.close()
    return { ...output, seen }
  }

  it.each([401, 403])(
    'HTTP %i: manda a chave run do env e explica, sem ecoá-la',
    async (status) => {
      const { code, text, seen } = await runUpdate(status, {
        ORCHESTRATOR_API_KEY_RUN: KEY
      })

      expect(code).toBe(1)
      expect(seen).toEqual([`Bearer ${KEY}`])
      expect(text).toContain('ORCHESTRATOR_API_KEY_RUN')
      expect(text).not.toContain(KEY)
    },
    30_000
  )

  it('sem a chave no env não manda Authorization', async () => {
    const { code, seen } = await runUpdate(401, { ORCHESTRATOR_API_KEY_RUN: '' })

    expect(code).toBe(1)
    expect(seen).toEqual([undefined])
  }, 30_000)
})
