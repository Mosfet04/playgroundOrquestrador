import 'server-only'

import { z } from 'zod'

import type { ConfigSchema } from '@/types/management'

import { callOrchestrator } from './client'

// GET /admin/schema (FA-03/FA-07, chave admin): as opções que o orquestrador em
// vigor aceita. Não está tipado no OpenAPI. Só as seções que os formulários usam
// (P3-01, P3-02); o resto do documento é ignorado (chave extra não derruba). Sem
// cache: uma leitura por abertura do formulário.
const embedderProviders = z.array(z.object({ name: z.string().min(1) }))
const chatProviders = z.array(
  z.object({
    name: z.string().min(1),
    model_params: z.array(z.string().min(1)),
    requires_base_url: z.boolean()
  })
)
const flag = z.object({ type: z.literal('boolean'), default: z.boolean() })

const schemaDocument = z.object({
  providers: z.object({ chat: chatProviders, embedder: embedderProviders }),
  agent: z.object({
    markdown: flag,
    add_history_to_context: flag,
    add_datetime_to_context: flag,
    reasoning: flag,
    num_history_runs: z.object({
      type: z.literal('integer'),
      default: z.number().int(),
      minimum: z.number().int(),
      maximum: z.number().int()
    })
  }),
  team: z.object({
    mode: z.array(z.string().min(1)).min(1),
    markdown: flag,
    add_history_to_context: flag
  }),
  tool: z.object({
    http_method: z.array(z.string().min(1)),
    parameter_type: z.array(z.string().min(1))
  }),
  // Cada formato começa com o prefixo da referência (`env:`): é o que o form
  // confere. Sem formato a trava não teria o que conferir: schema inválido.
  api_key_ref: z.object({ formats: z.array(z.string().regex(/^[^:]+:/)).min(1) }),
  config_store: z.object({ writable: z.boolean() })
})

const toConfigSchema = (doc: z.infer<typeof schemaDocument>): ConfigSchema => ({
  chatProviders: doc.providers.chat.map((provider) => ({
    name: provider.name,
    modelParams: provider.model_params,
    requiresBaseUrl: provider.requires_base_url
  })),
  embedderProviders: doc.providers.embedder.map(({ name }) => name),
  httpMethods: doc.tool.http_method,
  parameterTypes: doc.tool.parameter_type,
  agent: {
    markdown: doc.agent.markdown.default,
    addHistoryToContext: doc.agent.add_history_to_context.default,
    addDatetimeToContext: doc.agent.add_datetime_to_context.default,
    reasoning: doc.agent.reasoning.default,
    numHistoryRuns: {
      default: doc.agent.num_history_runs.default,
      minimum: doc.agent.num_history_runs.minimum,
      maximum: doc.agent.num_history_runs.maximum
    }
  },
  team: {
    modes: doc.team.mode,
    markdown: doc.team.markdown.default,
    addHistoryToContext: doc.team.add_history_to_context.default
  },
  apiKeyRefFormats: doc.api_key_ref.formats,
  writable: doc.config_store.writable
})

export const getConfigSchema = () =>
  callOrchestrator('/admin/schema', {
    key: 'admin',
    schema: schemaDocument.transform(toConfigSchema)
  })
