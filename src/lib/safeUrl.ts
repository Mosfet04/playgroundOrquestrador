// Links e imagens do markdown do agente vêm de conteúdo não confiável: só
// http(s) e mailto viram link (P2-04). Relativo, `//host`, `javascript:`,
// `data:` e variações com espaço ou maiúsculas ficam de fora (o sanitize também
// compara o protocolo sem ignorar caixa: `HTTPS://` vira texto).
const SAFE_HREF = /^(https?:\/\/|mailto:)/
const WEB_URL = /^https?:\/\//

export const isSafeHref = (url: string | undefined): url is string =>
  url !== undefined && SAFE_HREF.test(url)

export const isWebUrl = (url: string | undefined): url is string =>
  url !== undefined && WEB_URL.test(url)
