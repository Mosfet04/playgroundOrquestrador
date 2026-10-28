import { vi } from 'vitest'

// Controles que o EntityLoader dá ao formulário de edição (P3-06): nos testes
// do formulário isolado, espiões no lugar do carregador.
export const entityControls = () => ({ reload: vi.fn(), replace: vi.fn(), set: vi.fn(), update: vi.fn() })
