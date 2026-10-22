// Atualiza o snapshot do contrato do orquestrador (P2-02, decisão 0001):
// baixa o /openapi.json de um orquestrador local em development (só lá a rota
// existe) e grava docs/contracts/orchestrator-openapi.json formatado. O
// `pnpm contract:update` regenera os tipos em seguida. Com API_KEY_RUN e
// API_KEY_ADMIN ligadas no orquestrador, a rota pede a chave run: passe-a em
// ORCHESTRATOR_API_KEY_RUN (vai só no header, nunca no log).
//   ORCHESTRATOR_URL=http://127.0.0.1:7777 pnpm contract:update
import { writeFileSync } from 'node:fs'

const SNAPSHOT = 'docs/contracts/orchestrator-openapi.json'
const base = (process.env.ORCHESTRATOR_URL ?? 'http://127.0.0.1:7777').replace(/\/+$/, '')

const fail = (message: string): never => {
  console.error(`contract:update: ${message}`)
  process.exit(1)
}

const runKey = process.env.ORCHESTRATOR_API_KEY_RUN
const response = await fetch(`${base}/openapi.json`, {
  headers: runKey ? { Authorization: `Bearer ${runKey}` } : {},
  signal: AbortSignal.timeout(10_000)
}).catch((error: unknown) =>
  fail(`orquestrador inacessível em ${base} (${error instanceof Error ? error.name : 'erro'}).`)
)
if (response.status === 401 || response.status === 403)
  fail(
    `${base}/openapi.json respondeu HTTP ${response.status}: o orquestrador exige a chave run; ` +
      `passe-a em ORCHESTRATOR_API_KEY_RUN (${runKey ? 'a enviada foi recusada' : 'nenhuma foi enviada'}).`
  )
if (!response.ok)
  fail(`${base}/openapi.json respondeu HTTP ${response.status}; o orquestrador está com ENVIRONMENT=development?`)

const spec: unknown = await response.json()
if (
  typeof spec !== 'object' ||
  spec === null ||
  !('openapi' in spec) ||
  !('paths' in spec)
)
  fail('a resposta não é um documento OpenAPI.')

writeFileSync(SNAPSHOT, `${JSON.stringify(spec, null, 2)}\n`)
console.log(`contract:update: ${SNAPSHOT} atualizado a partir de ${base}.`)
