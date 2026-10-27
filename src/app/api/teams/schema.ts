import { z } from 'zod'

import type { TeamInput } from '@/server/orchestrator/teams'

const requiredText = z.string().trim().min(1)

// Campos aceitos de POST/PUT /api/teams (os do TeamForm); o resto é descartado.
// O BFF os traduz para o documento da API Admin (P3-04). Só a referência da
// chave (`env:`/`file:`), nunca o valor: o orquestrador valida.
export const teamBodySchema = z.object({
  id: requiredText,
  nome: requiredText,
  // Só o tipo: os valores válidos são os do orquestrador (decisão 0006).
  factoryIaModel: requiredText,
  model: requiredText,
  member_ids: z.array(requiredText).min(1),
  mode: requiredText,
  descricao: z.string().optional(),
  prompt: z.string().optional(),
  active: z.boolean().optional(),
  model_params: z.record(requiredText, z.union([z.string(), z.number(), z.boolean()])).optional(),
  base_url: z.string().trim().optional(),
  api_key_ref: z.string().trim().optional(),
  markdown: z.boolean().optional(),
  add_history_to_context: z.boolean().optional(),
  user_memory_active: z.boolean().optional(),
  summary_active: z.boolean().optional()
}) satisfies z.ZodType<TeamInput>

// No PUT o id vem da rota.
export const teamUpdateSchema = teamBodySchema.omit({ id: true })
