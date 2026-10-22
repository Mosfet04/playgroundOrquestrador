import 'server-only'

// Subcaminhos do jose (6.2): só JWS no bundle do middleware, sem o JWE.
import { SignJWT } from 'jose/jwt/sign'
import { jwtVerify } from 'jose/jwt/verify'
import { JOSEError } from 'jose/errors'

import { getServerEnv } from './env'

export const SESSION_COOKIE = 'session'
// Expiração absoluta, sem renovação (decisão 0017, D-P2-01-3).
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60

const ALGORITHM = 'HS256'
const secretKey = () => new TextEncoder().encode(getServerEnv().SESSION_SECRET)

// O usuário vai no `sub`: é o user_id das sessões do chat na P2-03.
export async function createSession(username: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(username)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey())
}

// Assinatura, algoritmo e validade conferidos; token recusado pelo jose é
// "sem sessão".
export async function verifySession(
  token: string
): Promise<{ username: string } | null> {
  // Fora do try: env inválido é erro de configuração, não "sem sessão".
  const key = secretKey()
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: [ALGORITHM],
      requiredClaims: ['exp', 'sub']
    })
    return payload.sub ? { username: payload.sub } : null
  } catch (error) {
    if (error instanceof JOSEError) return null
    throw error
  }
}

export function sessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'development',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS
  }
}
