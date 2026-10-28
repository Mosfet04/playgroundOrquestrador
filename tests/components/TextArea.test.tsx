import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TextArea } from '@/components/ui/textarea'

// P2-03 (V-P2-03-9): o mínimo do TextArea é classe, não estilo inline (que
// vencia qualquer classe); o composer passa o dele (32 px, 48 px em md) e os
// formulários seguem com o padrão de 40 px.
describe('TextArea', () => {
  it('padrão min-h-10 e teto max-h-24 por classe, sem min/max-height inline', () => {
    render(<TextArea aria-label="Descrição" />)

    const box = screen.getByRole('textbox', { name: 'Descrição' })
    expect(box).toHaveClass('min-h-10', 'max-h-24')
    expect(box.style.minHeight).toBe('')
    expect(box.style.maxHeight).toBe('')
  })

  // P3-06: o teto também é da classe, senão um mínimo maior (Instruções, 176 px)
  // nunca valeria.
  it('a classe de quem usa substitui o teto padrão', () => {
    render(<TextArea aria-label="Prompt" className="min-h-44 max-h-96" />)

    const box = screen.getByRole('textbox', { name: 'Prompt' })
    expect(box).toHaveClass('min-h-44', 'max-h-96')
    expect(box).not.toHaveClass('max-h-24')
  })

  it('a classe de quem usa substitui o mínimo padrão', () => {
    render(<TextArea aria-label="Mensagem" className="min-h-8 md:min-h-12" />)

    const box = screen.getByRole('textbox', { name: 'Mensagem' })
    expect(box).toHaveClass('min-h-8', 'md:min-h-12')
    expect(box).not.toHaveClass('min-h-10')
  })
})
