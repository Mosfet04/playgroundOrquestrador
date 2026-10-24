import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TextArea } from '@/components/ui/textarea'

// P2-03 (V-P2-03-9): o mínimo do TextArea é classe, não estilo inline (que
// vencia qualquer classe); o composer passa o dele (32 px, 48 px em md) e os
// formulários seguem com o padrão de 40 px.
describe('TextArea', () => {
  it('padrão min-h-10, sem min-height/height inline; teto de 96 px', () => {
    render(<TextArea aria-label="Descrição" />)

    const box = screen.getByRole('textbox', { name: 'Descrição' })
    expect(box).toHaveClass('min-h-10')
    expect(box.style.minHeight).toBe('')
    expect(box.style.maxHeight).toBe('96px')
  })

  it('a classe de quem usa substitui o mínimo padrão', () => {
    render(<TextArea aria-label="Mensagem" className="min-h-8 md:min-h-12" />)

    const box = screen.getByRole('textbox', { name: 'Mensagem' })
    expect(box).toHaveClass('min-h-8', 'md:min-h-12')
    expect(box).not.toHaveClass('min-h-10')
  })
})
