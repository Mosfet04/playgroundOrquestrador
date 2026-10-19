// Iniciais do avatar da entidade (docs/design/P1-06.md, § 3): 2 palavras ou
// mais, a 1ª letra das duas primeiras; 1 palavra, as 2 primeiras letras; nome
// vazio, o mesmo a partir do id.
export function initials(name: string, id = ''): string {
  const words = (name.trim() || id.trim()).split(/\s+/).filter(Boolean)
  const letters =
    words.length > 1
      ? words.slice(0, 2).map((word) => Array.from(word)[0])
      : Array.from(words[0] ?? '').slice(0, 2)
  return letters.join('').toUpperCase()
}
