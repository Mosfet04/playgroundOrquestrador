import 'server-only'

export const LOGIN_MAX_ATTEMPTS = 5
export const LOGIN_WINDOW_MS = 15 * 60 * 1000

// Tentativas de login por IP, em memória (vale para uma réplica só). Cada
// tentativa conferida é reservada antes do scrypt, de forma síncrona: uma
// rajada concorrente não passa de LOGIN_MAX_ATTEMPTS na janela. O login certo
// zera o IP. Com `maxTracked` IPs guardados, sai o mais antigo.
export function createLoginLimiter({ maxTracked = 10_000 } = {}) {
  const attempts = new Map<string, { count: number; resetAt: number }>()

  return {
    /** Reserva uma tentativa: 0 = liberada; senão, segundos até liberar. */
    attempt(ip: string, now = Date.now()) {
      const entry = attempts.get(ip)
      if (entry && entry.resetAt > now) {
        if (entry.count >= LOGIN_MAX_ATTEMPTS) {
          return Math.ceil((entry.resetAt - now) / 1000)
        }
        entry.count += 1
        return 0
      }
      attempts.delete(ip)
      if (attempts.size >= maxTracked) {
        // A Map guarda a ordem de inserção: a 1ª chave é a mais antiga.
        const oldest = attempts.keys().next().value
        if (oldest !== undefined) attempts.delete(oldest)
      }
      attempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS })
      return 0
    },
    reset(ip: string) {
      attempts.delete(ip)
    },
    size: () => attempts.size
  }
}
