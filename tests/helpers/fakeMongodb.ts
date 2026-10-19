// Substituto de `@/lib/mongodb` para testes de route handler (P0-05):
// `vi.mock('@/lib/mongodb', () => import('../helpers/fakeMongodb'))`.
// Coleções em memória com o subconjunto do driver usado pelas rotas; filtro com
// operador desconhecido lança erro, para o teste não passar por acaso.
type Doc = Record<string, unknown>
type Filter = Record<string, unknown>

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readPath(doc: Doc, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (value, key) => (isPlainObject(value) ? value[key] : undefined),
      doc
    )
}

function matchesValue(value: unknown, expected: unknown): boolean {
  if (!isPlainObject(expected)) return value === expected
  const { $regex, $options, ...rest } = expected
  if (typeof $regex !== 'string' || Object.keys(rest).length > 0) {
    throw new Error(
      `fakeMongodb: filtro não suportado ${JSON.stringify(Object.keys(expected))}`
    )
  }
  const flags = typeof $options === 'string' ? $options : ''
  return typeof value === 'string' && new RegExp($regex, flags).test(value)
}

function matches(doc: Doc, filter: Filter): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') {
      return (expected as Filter[]).some((clause) => matches(doc, clause))
    }
    return matchesValue(readPath(doc, key), expected)
  })
}

export function createFakeCollection() {
  let docs: Doc[] = []
  const calls: string[] = []

  const filtered = (filter: Filter) =>
    docs.filter((doc) => matches(doc, filter))

  return {
    /** Métodos chamados desde o último `reset`, para afirmar "não tocou o banco". */
    calls,
    reset(seed: Doc[] = []) {
      docs = seed.map((doc) => ({ ...doc }))
      calls.splice(0)
    },
    async findOne(filter: Filter) {
      calls.push('findOne')
      return filtered(filter)[0] ?? null
    },
    async countDocuments(filter: Filter) {
      calls.push('countDocuments')
      return filtered(filter).length
    },
    find(filter: Filter) {
      calls.push('find')
      let result = filtered(filter)
      const cursor = {
        sort: () => cursor,
        skip(count: number) {
          result = result.slice(count)
          return cursor
        },
        limit(count: number) {
          result = result.slice(0, count)
          return cursor
        },
        toArray: async () => result
      }
      return cursor
    },
    async insertOne(doc: Doc) {
      calls.push('insertOne')
      docs.push({ ...doc })
      return { insertedId: `fake-${docs.length}` }
    },
    async updateOne(filter: Filter, update: { $set: Doc }) {
      calls.push('updateOne')
      const index = docs.findIndex((doc) => matches(doc, filter))
      if (index === -1) return { matchedCount: 0 }
      docs[index] = { ...docs[index], ...update.$set }
      return { matchedCount: 1 }
    },
    async deleteOne(filter: Filter) {
      calls.push('deleteOne')
      const before = docs.length
      docs = docs.filter((doc) => !matches(doc, filter))
      return { deletedCount: before - docs.length }
    }
  }
}

export const agentsCollection = createFakeCollection()
export const toolsCollection = createFakeCollection()
