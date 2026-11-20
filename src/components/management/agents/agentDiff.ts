import { boolRow, idsRow, paramsRows, secretRow, textRow, type DiffRow } from '@/lib/formDiff'
import type { CreateAgentForm } from '@/types/management'

// Campos do formulário do agent na ordem da tela (P3-06): o rótulo é o da UI,
// sem o asterisco de obrigatório. `id` e `active` não entram.
type Label =
  | 'name'
  | 'description'
  | 'provider'
  | 'model'
  | 'baseUrl'
  | 'apiKeyRef'
  | 'modelParams'
  | 'systemPrompt'
  | 'markdown'
  | 'addDatetime'
  | 'addHistory'
  | 'numHistoryRuns'
  | 'reasoning'
  | 'exposeReasoning'
  | 'userMemory'
  | 'summary'
  | 'ragEnable'
  | 'ragDocName'
  | 'ragStrategy'
  | 'ragProvider'
  | 'ragModel'
  | 'ragApiKeyRef'
  | 'ragModelParams'
  | 'tools'
  | 'ragEmbedder'

// RAG sem valor nenhum e desligado: o BFF não grava `rag_config`, e o provedor e
// a estratégia do formulário são só padrão (P4-02 §7). Nesse lado eles valem
// vazio, e nunca aparecem como "Antes" de um RAG ligado depois.
const ragEmpty = (form: CreateAgentForm) =>
  !form.rag_active &&
  !form.rag_doc_name &&
  !form.rag_model &&
  !form.rag_base_url &&
  !form.rag_api_key_ref &&
  Object.keys(form.rag_model_params ?? {}).length === 0

const withoutRagDefaults = (form: CreateAgentForm): CreateAgentForm =>
  ragEmpty(form) ? { ...form, rag_factoryIaModel: '', rag_search_strategy: '' } : form

export function diffAgent(
  formPayload: CreateAgentForm,
  readPayload: CreateAgentForm,
  t: (key: Label) => string,
  prefixes: string[]
): DiffRow[] {
  const l = (key: Label) => t(key).replace(/\s*\*$/, '')
  const mono = { mono: true }
  const mine = withoutRagDefaults(formPayload)
  const current = withoutRagDefaults(readPayload)
  return [
    ...textRow('nome', l('name'), mine.nome, current.nome),
    ...textRow('descricao', l('description'), mine.descricao, current.descricao, { long: true }),
    ...textRow('factoryIaModel', l('provider'), mine.factoryIaModel, current.factoryIaModel, mono),
    ...textRow('model', l('model'), mine.model, current.model, mono),
    ...textRow('base_url', l('baseUrl'), mine.base_url, current.base_url, mono),
    ...secretRow('api_key_ref', l('apiKeyRef'), mine.api_key_ref, current.api_key_ref, prefixes),
    ...paramsRows('model_params', l('modelParams'), mine.model_params, current.model_params),
    ...textRow('prompt', l('systemPrompt'), mine.prompt, current.prompt, { long: true }),
    ...boolRow('markdown', l('markdown'), mine.markdown, current.markdown),
    ...boolRow('add_datetime_to_context', l('addDatetime'), mine.add_datetime_to_context, current.add_datetime_to_context),
    ...boolRow('add_history_to_context', l('addHistory'), mine.add_history_to_context, current.add_history_to_context),
    ...textRow('num_history_runs', l('numHistoryRuns'), mine.num_history_runs, current.num_history_runs, mono),
    ...boolRow('reasoning', l('reasoning'), mine.reasoning, current.reasoning),
    ...boolRow('expose_reasoning', l('exposeReasoning'), mine.expose_reasoning, current.expose_reasoning),
    ...boolRow('user_memory_active', l('userMemory'), mine.user_memory_active, current.user_memory_active),
    ...boolRow('summary_active', l('summary'), mine.summary_active, current.summary_active),
    ...boolRow('rag_active', l('ragEnable'), mine.rag_active, current.rag_active),
    ...textRow('rag_doc_name', l('ragDocName'), mine.rag_doc_name, current.rag_doc_name, mono),
    ...textRow('rag_search_strategy', l('ragStrategy'), mine.rag_search_strategy, current.rag_search_strategy, mono),
    ...textRow('rag_factoryIaModel', l('ragProvider'), mine.rag_factoryIaModel, current.rag_factoryIaModel, mono),
    ...textRow('rag_model', l('ragModel'), mine.rag_model, current.rag_model, mono),
    ...textRow('rag_base_url', `${l('baseUrl')} (${l('ragEmbedder')})`, mine.rag_base_url, current.rag_base_url, mono),
    ...secretRow('rag_api_key_ref', l('ragApiKeyRef'), mine.rag_api_key_ref, current.rag_api_key_ref, prefixes),
    ...paramsRows('rag_model_params', l('ragModelParams'), mine.rag_model_params, current.rag_model_params),
    ...idsRow('tools_ids', l('tools'), mine.tools_ids, current.tools_ids)
  ]
}
