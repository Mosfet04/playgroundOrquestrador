import { expect, test } from '@playwright/test'

import { APP_URL } from '../playwright.config'

// V16 (P1-01, decisão 0008): a fonte vem do próprio app. O download do
// next/font/google acontece no servidor (next dev/build), invisível ao
// browser; por isso este e2e prova o lado do browser (nenhuma rede externa,
// faces locais carregáveis, família aplicada) e o lint barra o import
// (eslint.config.mjs, `no-restricted-imports`).
test('fontes: IBM Plex servida do próprio app, sem requisição externa', async ({
  page
}) => {
  const external: string[] = []
  await page.route(
    (url) => url.origin !== APP_URL,
    (route) => {
      external.push(route.request().url())
      return route.abort()
    }
  )
  const fontRequests: string[] = []
  page.on('request', (request) => {
    if (/\.woff2?(\?|$)/.test(request.url())) fontRequests.push(request.url())
  })

  await page.goto('/')

  // A família vem do CSS (`--font-sans`/`--font-mono`, primeira entrada), não
  // do nome das constantes do layout. Carrega todas as faces declaradas: a
  // página inicial só usa algumas e as outras ficam `unloaded`.
  const info = await page.evaluate(async () => {
    const unquote = (value: string) => value.replace(/^["']|["']$/g, '')
    const first = (list: string) => unquote(list.split(',')[0].trim())
    const style = getComputedStyle(document.body)
    const sans = first(style.getPropertyValue('--font-sans'))
    const mono = first(style.getPropertyValue('--font-mono'))
    const faces = [...document.fonts].filter((face) =>
      [sans, mono].includes(unquote(face.family))
    )
    await Promise.all(faces.map((face) => face.load()))
    return {
      sans,
      mono,
      bodyFamily: style.fontFamily,
      faces: faces.map(
        (face) =>
          `${unquote(face.family) === sans ? 'sans' : 'mono'} ${face.weight} ${face.style} ${face.status}`
      )
    }
  })

  expect(info.sans).not.toBe('')
  expect(info.mono).not.toBe('')
  expect(info.sans).not.toBe(info.mono)
  expect(info.bodyFamily.replace(/["']/g, '')).toMatch(
    new RegExp(`^${info.sans}(,|$)`)
  )
  expect(info.faces.sort()).toEqual([
    'mono 400 normal loaded',
    'mono 500 normal loaded',
    'sans 400 italic loaded',
    'sans 400 normal loaded',
    'sans 500 normal loaded',
    'sans 600 normal loaded'
  ])

  expect(fontRequests.length).toBeGreaterThanOrEqual(6)
  for (const url of fontRequests) {
    const { origin, pathname } = new URL(url)
    expect(origin).toBe(APP_URL)
    expect(pathname).toMatch(/^\/_next\/static\/media\/.+\.woff2$/)
  }
  expect(external).toEqual([])
})
