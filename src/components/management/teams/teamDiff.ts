import { boolRow, idsRow, paramsRows, textRow, type DiffRow } from '@/lib/formDiff'
import type { CreateTeamForm } from '@/types/management'

// Campos do formulário do team na ordem da tela (P3-06). Os rótulos de
// provedor, modelo, conexão e execução são os do agent (`agents.form`), como
// nas seções compartilhadas; `own` traz os do team.
type OwnLabel = 'name' | 'description' | 'members' | 'mode' | 'systemPrompt'
type SharedLabel =
  | 'provider'
  | 'model'
  | 'baseUrl'
  | 'apiKeyRef'
  | 'modelParams'
  | 'markdown'
  | 'addHistory'
  | 'userMemory'
  | 'summary'

export function diffTeam(
  mine: CreateTeamForm,
  current: CreateTeamForm,
  own: (key: OwnLabel) => string,
  shared: (key: SharedLabel) => string
): DiffRow[] {
  const l = (text: string) => text.replace(/\s*\*$/, '')
  const mono = { mono: true }
  return [
    ...textRow('nome', l(own('name')), mine.nome, current.nome),
    ...textRow('descricao', l(own('description')), mine.descricao, current.descricao, { long: true }),
    ...idsRow('member_ids', l(own('members')), mine.member_ids, current.member_ids),
    ...textRow('mode', l(own('mode')), mine.mode, current.mode, mono),
    ...textRow('factoryIaModel', l(shared('provider')), mine.factoryIaModel, current.factoryIaModel, mono),
    ...textRow('model', l(shared('model')), mine.model, current.model, mono),
    ...textRow('base_url', l(shared('baseUrl')), mine.base_url, current.base_url, mono),
    ...textRow('api_key_ref', l(shared('apiKeyRef')), mine.api_key_ref, current.api_key_ref, mono),
    ...paramsRows('model_params', l(shared('modelParams')), mine.model_params, current.model_params),
    ...textRow('prompt', l(own('systemPrompt')), mine.prompt, current.prompt, { long: true }),
    ...boolRow('markdown', l(shared('markdown')), mine.markdown, current.markdown),
    ...boolRow('add_history_to_context', l(shared('addHistory')), mine.add_history_to_context, current.add_history_to_context),
    ...boolRow('user_memory_active', l(shared('userMemory')), mine.user_memory_active, current.user_memory_active),
    ...boolRow('summary_active', l(shared('summary')), mine.summary_active, current.summary_active)
  ]
}
