type HastNode = { type: string; value?: string; children?: HastNode[] }

// Sem `rehype-raw`, o react-markdown deixa o HTML cru como nós `raw`, que o
// sanitize descartaria com o texto em volta (D-P2-04-2). Aqui eles viram texto:
// as tags aparecem literais e o React escapa, então nada vira elemento.
const toText = (node: HastNode): HastNode => {
  if (node.type === 'raw') return { type: 'text', value: node.value }
  return node.children ? { ...node, children: node.children.map(toText) } : node
}

export const rehypeRawToText = () => toText
