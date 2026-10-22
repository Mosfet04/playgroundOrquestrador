// Boot do servidor (Next): sem o env completo, o processo não sobe e o erro
// cita só os nomes das variáveis (src/server/env.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { getServerEnv } = await import('./server/env')
  getServerEnv()
}
