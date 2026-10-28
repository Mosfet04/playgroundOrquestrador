import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import MarkdownRenderer from '@/components/ui/typography/MarkdownRenderer'

// P2-04: o markdown vem da saída do agente (não confiável). HTML cru aparece
// como texto literal, sem criar elemento (D-P2-04-2), link perigoso perde o
// href e imagem não é carregada (D-P2-04-1).
const NO_DANGEROUS_NODES = 'script, iframe, img, [onerror], [onclick], [srcdoc]'

describe.each([
  ['bloco', false],
  ['inline', true]
])('MarkdownRenderer (%s)', (_name, inline) => {
  const renderMd = (md: string) =>
    render(<MarkdownRenderer inline={inline}>{md}</MarkdownRenderer>)

  it('mostra <script> como texto, sem criar o elemento', () => {
    const { container } = renderMd('antes <script>window.__pwned=1</script> depois')

    expect(container.querySelector('script')).toBeNull()
    expect(container).toHaveTextContent('antes <script>window.__pwned=1</script> depois')
    expect(window).not.toHaveProperty('__pwned')
  })

  it('mostra <img onerror> como texto, sem criar o elemento', () => {
    const { container } = renderMd('<img src=x onerror="window.__pwned=1">')

    expect(container.querySelector(NO_DANGEROUS_NODES)).toBeNull()
    expect(container).toHaveTextContent('<img src=x onerror="window.__pwned=1">')
  })

  it('mostra <iframe> como texto, sem criar o elemento', () => {
    const { container } = renderMd('<iframe src="https://atacante.test"></iframe>')

    expect(container.querySelector('iframe')).toBeNull()
    expect(container).toHaveTextContent('<iframe src="https://atacante.test"></iframe>')
  })

  it('mostra HTML cru, inline e em bloco, como texto', () => {
    const { container } = renderMd(
      'texto <b onclick="x()">negrito</b> fim\n\n<div style="x"><u>bloco</u></div>'
    )

    expect(container.querySelector('b, div[style], [onclick], u')).toBeNull()
    expect(container).toHaveTextContent('texto <b onclick="x()">negrito</b> fim')
    expect(container).toHaveTextContent('<div style="x"><u>bloco</u></div>')
  })

  it('mostra tag pseudo-XML em bloco com o conteúdo e as tags literais', () => {
    const { container } = renderMd('<answer>\nA resposta é 42.\n</answer>')

    expect(container.querySelector('answer')).toBeNull()
    expect(container).toHaveTextContent('<answer>')
    expect(container).toHaveTextContent('A resposta é 42.')
    expect(container).toHaveTextContent('</answer>')
  })

  it('mantém "<Enter>" no meio da frase', () => {
    const { container } = renderMd('Pressione <Enter> para enviar')

    expect(container).toHaveTextContent('Pressione <Enter> para enviar')
  })

  it.each([
    ['javascript:', '[clique](javascript:alert(1))', 'clique'],
    ['data:', '[clique](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)', 'clique'],
    ['vbscript:', '[clique](vbscript:msgbox(1))', 'clique'],
    ['maiúsculas', '[clique](JaVaScRiPt:alert(1))', 'clique'],
    ['espaço antes', '[clique](< JaVaScRiPt:alert(1)>)', 'clique'],
    ['entidade nomeada', '[clique](javascript&colon;alert(1))', 'clique'],
    ['entidade numérica', '[clique](&#106;avascript:alert(1))', 'clique'],
    ['autolink', '<javascript:alert(1)>', 'javascript:alert(1)'],
    ['referência', '[clique][r]\n\n[r]: javascript:alert(1)', 'clique'],
    ['relativo', '[clique](/admin/config)', 'clique'],
    ['protocolo relativo', '[clique](//atacante.test/x)', 'clique'],
    ['link html', '<a href="javascript:alert(1)">clique</a>', 'clique']
  ])('não cria link com href %s', (_label, md, text) => {
    const { container } = renderMd(md)

    expect(screen.queryByRole('link')).toBeNull()
    expect(container.querySelector('[href]')).toBeNull()
    expect(container).toHaveTextContent(text)
  })

  it('imagem vira link com o texto alternativo, sem <img> nem requisição', () => {
    const { container } = renderMd('![gráfico de vendas](https://cdn.test/a.png)')

    const link = screen.getByRole('link', { name: 'gráfico de vendas' })
    expect(link).toHaveAttribute('href', 'https://cdn.test/a.png')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(container.querySelector('img')).toBeNull()
  })

  it('imagem sem texto alternativo usa a própria URL como texto do link', () => {
    renderMd('![](https://cdn.test/a.png)')

    expect(screen.getByRole('link', { name: 'https://cdn.test/a.png' })).toHaveAttribute(
      'href',
      'https://cdn.test/a.png'
    )
  })

  it('imagem com src perigoso mostra só o texto alternativo, sem link', () => {
    const { container } = renderMd('![alternativo](javascript:alert(1))')

    expect(screen.queryByRole('link')).toBeNull()
    expect(container.querySelector('img, [src], [href]')).toBeNull()
    expect(container).toHaveTextContent('alternativo')
  })

  it('imagem com src perigoso e sem texto alternativo some', () => {
    const { container } = renderMd('![](data:image/svg+xml;base64,AAAA)')

    expect(container.querySelector('img, [src], [href]')).toBeNull()
  })

  it('imagem dentro de link vira só o texto alternativo, sem <a> aninhado', () => {
    const { container } = renderMd('[![badge](https://img.test/b.svg)](https://repo.test)')

    const link = screen.getByRole('link', { name: 'badge' })
    expect(link).toHaveAttribute('href', 'https://repo.test')
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(container.querySelector('a a, img')).toBeNull()
  })

  it('imagem sem alt dentro de link usa a URL como texto, sem <a> vazio', () => {
    const { container } = renderMd('[![](https://img.test/b.svg)](https://repo.test)')

    const link = screen.getByRole('link', { name: 'https://img.test/b.svg' })
    expect(link).toHaveAttribute('href', 'https://repo.test')
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(container.querySelector('a a, img')).toBeNull()
  })

  it('link http(s) e mailto abrem em nova aba com rel seguro', () => {
    renderMd('[site](https://exemplo.test/p?a=1) e [email](mailto:ola@exemplo.test)')

    for (const [name, href] of [
      ['site', 'https://exemplo.test/p?a=1'],
      ['email', 'mailto:ola@exemplo.test']
    ]) {
      const link = screen.getByRole('link', { name })
      expect(link).toHaveAttribute('href', href)
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })

  it('renderiza listas e código', () => {
    const { container } = renderMd(
      '- um\n- dois\n\n1. primeiro\n2. segundo\n\n```js\nconst a = 1\n```\n\n`inline`'
    )

    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    expect(container.querySelector('ul')).not.toBeNull()
    expect(container.querySelector('ol')).not.toBeNull()
    expect(container).toHaveTextContent('const a = 1')
    expect(container).toHaveTextContent('inline')
  })
})

describe('MarkdownRenderer (bloco): tabela GFM', () => {
  it('renderiza a tabela com cabeçalho e células', () => {
    render(<MarkdownRenderer>{'| Nome | Valor |\n| --- | --- |\n| a | 1 |'}</MarkdownRenderer>)

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Nome' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '1' })).toBeInTheDocument()
  })
})
