import { screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

// Salvar numa edição passa pelo diálogo de revisão (P4-02): Salvar + Confirmar.
export async function saveAndConfirm(user: UserEvent) {
  await user.click(await screen.findByRole('button', { name: /^(Salvar|Save)$/ }))
  const dialog = await screen.findByRole('dialog', { name: /^(Revisar antes de salvar|Review before saving)$/ })
  await user.click(within(dialog).getByRole('button', { name: /^(Confirmar e salvar|Confirm and save)$/ }))
}

// Sem mudança o Salvar não envia: uma edição mínima, para os testes que olham o
// resto do documento no PUT. Na tool, o nome da entidade é o 1º "Nome *".
export async function touchName(user: UserEvent) {
  const [name] = await screen.findAllByLabelText(/^(Nome|Name) \*$/)
  await user.type(name, ' x')
}
