import { notFound } from 'next/navigation'

// Endereço sem rota: no Next 15.2 ele cai no not-found da raiz, fora do layout
// (app). Este catch-all chama notFound() aqui dentro para o 404 sair na casca
// ((app)/not-found.tsx, V-P1-05-15).
export default function UnknownRoute() {
  notFound()
}
