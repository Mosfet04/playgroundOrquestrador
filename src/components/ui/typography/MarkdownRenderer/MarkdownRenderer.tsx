import { type FC } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize, { defaultSchema, type Options } from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

import { cn } from '@/lib/utils'

import { type MarkdownRendererProps } from './types'
import { inlineComponents } from './inlineStyles'
import { rehypeRawToText } from './rehypeRawToText'
import { components } from './styles'

// HTML cru do agente vira texto (rehypeRawToText) antes do sanitize, que só
// vê o que o markdown gera. O schema padrão já limita `src` a http(s); o `href`
// fica só em http(s)/mailto, como defesa em profundidade: quem decide o que
// vira link é o SafeLink (src/lib/safeUrl.ts).
const schema: Options = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto']
  }
}

const MarkdownRenderer: FC<MarkdownRendererProps> = ({
  children,
  classname,
  inline = false
}) => (
  <ReactMarkdown
    className={cn(
      'prose prose-h1:text-xl dark:prose-invert flex w-full flex-col gap-y-5 rounded-lg',
      classname
    )}
    components={{ ...(inline ? inlineComponents : components) }}
    remarkPlugins={[remarkGfm]}
    rehypePlugins={[rehypeRawToText, [rehypeSanitize, schema]]}
  >
    {children}
  </ReactMarkdown>
)

export default MarkdownRenderer
