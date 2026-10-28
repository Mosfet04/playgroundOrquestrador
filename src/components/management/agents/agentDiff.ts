import { boolRow, idsRow, paramsRows, textRow, type DiffRow } from '@/lib/formDiff'
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

// RAG sem valor nenhum e desligado: o formulário só mostra padrões (provedor e
// estratégia do schema), que o BFF não grava (`rag_config` null). Dois lados
// assim não diferem.
const ragEmpty = (form: CreateAgentForm) =>
  !form.rag_active &&
  !form.rag_doc_name &&
  !form.rag_model &&
  !form.rag_base_url &&
  !form.rag_api_key_ref &&
  Object.keys(form.rag_model_params ?? {}).length === 0

export function diffAgent(
  mine: CreateAgentForm,
  current: CreateAgentForm,
  t: (key: Label) => string
): DiffRow[] {
  const l = (key: Label) => t(key).replace(/\s*\*$/, '')
  const mono = { mono: true }
  const rag = !(ragEmpty(mine) && ragEmpty(current))
  return [
    ...textRow('nome', l('name'), mine.nome, current.nome),
    ...textRow('descricao', l('description'), mine.descricao, current.descricao, { long: true }),
    ...textRow('factoryIaModel', l('provider'), mine.factoryIaModel, current.factoryIaModel, mono),
    ...textRow('model', l('model'), mine.model, current.model, mono),
    ...textRow('base_url', l('baseUrl'), mine.base_url, current.base_url, mono),
    ...textRow('api_key_ref', l('apiKeyRef'), mine.api_key_ref, current.api_key_ref, mono),
    ...paramsRows('model_params', l('modelParams'), mine.model_params, current.model_params),
    ...textRow('prompt', l('systemPrompt'), mine.prompt, current.prompt, { long: true }),
    ...boolRow('markdown', l('markdown'), mine.markdown, current.markdown),
    ...boolRow('add_datetime_to_context', l('addDatetime'), mine.add_datetime_to_context, current.add_datetime_to_context),
    ...boolRow('add_history_to_context', l('addHistory'), mine.add_history_to_context, current.add_history_to_context),
    ...textRow('num_history_runs', l('numHistoryRuns'), mine.num_history_runs, current.num_history_runs, mono),
    ...boolRow('reasoning', l('reasoning'), mine.reasoning, current.reasoning),
    ...boolRow('user_memory_active', l('userMemory'), mine.user_memory_active, current.user_memory_active),
    ...boolRow('summary_active', l('summary'), mine.summary_active, current.summary_active),
    ...(rag ? boolRow('rag_active', l('ragEnable'), mine.rag_active, current.rag_active) : []),
    ...(rag ? textRow('rag_doc_name', l('ragDocName'), mine.rag_doc_name, current.rag_doc_name, mono) : []),
    ...(rag ? textRow('rag_search_strategy', l('ragStrategy'), mine.rag_search_strategy, current.rag_search_strategy, mono) : []),
    ...(rag ? textRow('rag_factoryIaModel', l('ragProvider'), mine.rag_factoryIaModel, current.rag_factoryIaModel, mono) : []),
    ...(rag ? textRow('rag_model', l('ragModel'), mine.rag_model, current.rag_model, mono) : []),
    ...(rag ? textRow('rag_base_url', `${l('baseUrl')} (${l('ragEmbedder')})`, mine.rag_base_url, current.rag_base_url, mono) : []),
    ...(rag ? textRow('rag_api_key_ref', l('ragApiKeyRef'), mine.rag_api_key_ref, current.rag_api_key_ref, mono) : []),
    ...(rag ? paramsRows('rag_model_params', l('ragModelParams'), mine.rag_model_params, current.rag_model_params) : []),
    ...idsRow('tools_ids', l('tools'), mine.tools_ids, current.tools_ids)
  ]
}
