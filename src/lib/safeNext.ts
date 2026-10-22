const BASE = 'http://playground.invalid'

// Destino do `?next=` do login: só caminho deste app (sem open redirect). O
// que não for caminho absoluto interno (`//host`, `https://…`, `\`) vira `/`.
// A checagem vale também depois de normalizar: `/.//host` e `/a/..//host`
// viram `//host` no URL.
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.includes('\\')) return '/'
  const url = new URL(next, BASE)
  if (url.origin !== BASE || url.pathname.startsWith('//')) return '/'
  return `${url.pathname}${url.search}${url.hash}`
}
