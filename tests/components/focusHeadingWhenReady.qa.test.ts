import { afterEach, describe, expect, it, vi } from 'vitest'

import { focusHeadingWhenReady } from '@/components/ui/loading'

// QA1-01: depois de excluir, o loading.tsx da seção aparece sem h1; o foco tem
// de ir ao h1 da página nova quando ele chega, e o observer não pode vazar.

const addHeading = () => {
  const h1 = document.createElement('h1')
  h1.tabIndex = -1
  h1.textContent = 'Tools'
  document.body.append(h1)
  return h1
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('focusHeadingWhenReady', () => {
  it('foca o h1 que chega depois do fallback', async () => {
    focusHeadingWhenReady()
    const h1 = addHeading()
    await vi.waitFor(() => expect(document.activeElement).toBe(h1))
  })

  it('foca na hora quando o h1 já existe', () => {
    const h1 = addHeading()
    focusHeadingWhenReady()
    expect(document.activeElement).toBe(h1)
  })

  it('não rouba o foco se o usuário já focou outro elemento', async () => {
    const button = document.createElement('button')
    document.body.append(button)
    button.focus()
    focusHeadingWhenReady()
    addHeading()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(document.activeElement).toBe(button)
  })

  it('desiste em 5 s: h1 tardio não recebe foco', async () => {
    vi.useFakeTimers()
    focusHeadingWhenReady()
    await vi.advanceTimersByTimeAsync(5001)
    const h1 = addHeading()
    await vi.advanceTimersByTimeAsync(50)
    expect(document.activeElement).not.toBe(h1)
  })
})
