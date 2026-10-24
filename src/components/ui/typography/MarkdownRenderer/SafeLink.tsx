import { createContext, useContext } from 'react'

import { isSafeHref, isWebUrl } from '@/lib/safeUrl'

import type { AnchorLinkProps, ImgProps } from './types'

// Dentro de um link, a imagem vira só o texto alternativo: `<a>` aninhado é
// DOM inválido e o clique iria para a imagem em vez do link externo.
const InsideLink = createContext(false)

// Link do markdown do agente: sem href seguro (http, https, mailto) vira texto.
export const SafeLink = ({ href, children, ...props }: AnchorLinkProps) =>
  isSafeHref(href) ? (
    <a {...props} href={href} target="_blank" rel="noopener noreferrer">
      <InsideLink.Provider value>{children}</InsideLink.Provider>
    </a>
  ) : (
    <span>{children}</span>
  )

// Imagem do agente não é carregada (D-P2-04-1): vira link com o texto
// alternativo (ou a própria URL). Sem URL http(s), só o texto alternativo;
// dentro de outro link, o texto alternativo ou a URL, sem `<a>` aninhado.
export const ImageLink = ({ src, alt }: ImgProps) => {
  const insideLink = useContext(InsideLink)

  if (insideLink && typeof src === 'string') return <span>{alt || src}</span>

  if (typeof src !== 'string' || !isWebUrl(src)) {
    return alt ? <span>{alt}</span> : null
  }

  return (
    <SafeLink href={src} className="cursor-pointer underline">
      {alt || src}
    </SafeLink>
  )
}
