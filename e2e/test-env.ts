// Env do servidor nos testes (Vitest e Playwright, que o repassa ao app):
// valores de teste, nunca segredo real. Os segredos levam a marca
// `e2e-segredo` e o hash começa com `scrypt:`, que a CI procura no bundle do
// browser (.next/static) e não pode achar.
export const TEST_USER = { username: 'playground', password: 'senha-de-teste' }

export const TEST_ENV = {
  ORCHESTRATOR_URL: 'http://127.0.0.1:7790',
  ORCHESTRATOR_API_KEY_RUN: 'e2e-segredo-run',
  ORCHESTRATOR_API_KEY_ADMIN: 'e2e-segredo-admin',
  SESSION_SECRET: 'e2e-segredo-sessao-0123456789abcdef0123456789',
  AUTH_USERNAME: TEST_USER.username,
  // `printf '%s' 'senha-de-teste' | pnpm -s auth:hash`
  AUTH_PASSWORD_HASH:
    'scrypt:0a647033453a88620721ed9c2a763c77:5ce0cef104c516f585ef9186dfb155bd9558f4f5d706cb3ffff1327a077c37c2f1e6352b52597db638dbe536eaeb52e9a6e87cd284a1f1d67b02a89eb05274ea'
}
