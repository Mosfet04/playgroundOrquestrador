import 'server-only'

import { z } from 'zod'

import type { ConfigSchema } from '@/types/management'

import { callOrchestrator } from './client'

// GET /admin/schema (FA-03, chave admin): as opções que o orquestrador em vigor
// aceita. Não está tipado no OpenAPI. Só as seções que os formulários usam
// (P3-01); o resto do documento é ignorado (chave extra não derruba). Sem cache:
// uma leitura por abertura do formulário.
const providers = z.array(z.object({ name: z.string().min(1) }))

const schemaDocument = z.object({
  providers: z.object({ chat: providers, embedder: providers }),
  tool: z.object({
    http_method: z.array(z.string().min(1)),
    parameter_type: z.array(z.string().min(1))
  }),
  config_store: z.object({ writable: z.boolean() })
})

const toConfigSchema = (doc: z.infer<typeof schemaDocument>): ConfigSchema => ({
  chatProviders: doc.providers.chat.map(({ name }) => name),
  embedderProviders: doc.providers.embedder.map(({ name }) => name),
  httpMethods: doc.tool.http_method,
  parameterTypes: doc.tool.parameter_type,
  writable: doc.config_store.writable
})

export const getConfigSchema = () =>
  callOrchestrator('/admin/schema', {
    key: 'admin',
    schema: schemaDocument.transform(toConfigSchema)
  })
