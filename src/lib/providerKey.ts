// Provedor do orquestrador → chave dos textos `providers.*` (QA1-11, #23). O
// mesmo provedor chega de três jeitos: o id gravado (`gemini`, `azure`), o
// alias que o orquestrador também lista (`google`, `azureopenai`) e o nome de
// classe do agno nas métricas e no playground (`Google`, `Azure`, `OpenAI`):
// a chave é o valor em minúsculas. O orquestrador não manda rótulo, só o `name`.
const PROVIDER_KEYS = [
  'ollama',
  'openai',
  'anthropic',
  'groq',
  'gemini',
  'google',
  'azure',
  'azureopenai',
  'openai_compatible'
] as const

type ProviderKey = (typeof PROVIDER_KEYS)[number]

// `includes` e não objeto: o valor vem do orquestrador e não pode casar com
// propriedade de Object (`constructor`).
const isProviderKey = (value: string): value is ProviderKey =>
  (PROVIDER_KEYS as readonly string[]).includes(value)

export function providerKey(raw: string): ProviderKey | undefined {
  const key = raw.trim().toLowerCase()
  return isProviderKey(key) ? key : undefined
}

// Os provedores que se confundem têm descrição curta no dropdown (`providers.*.description`).
const DESCRIBED_KEYS = [
  'gemini',
  'google',
  'azure',
  'azureopenai',
  'openai_compatible'
] as const

type DescribedProviderKey = (typeof DESCRIBED_KEYS)[number]

export const hasDescription = (key: ProviderKey): key is DescribedProviderKey =>
  (DESCRIBED_KEYS as readonly string[]).includes(key)
