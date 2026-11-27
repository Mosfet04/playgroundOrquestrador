// Tag `<code>` das mensagens do editor de tool (nomes e prefixos em mono). Nome
// longo e sem espaço quebra em qualquer ponto, em vez de vazar da mensagem.
export const code = (chunks: React.ReactNode) => (
  <code className="font-mono [overflow-wrap:anywhere]">{chunks}</code>
)
