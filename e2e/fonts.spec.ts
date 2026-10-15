import { expect, test } from '@playwright/test'

import { APP_URL } from '../playwright.config'

// V16 (P1-01, decisão 0008): a fonte vem do próprio app. O download do
// next/font/google acontece no servidor (next dev/build), invisível ao
// browser; por isso este e2e prova o lado do browser (nenhuma rede externa,
// faces locais carregáveis, família aplicada) e o lint barra o import
// (eslint.config.mjs, `no-restricted-imports`).
// R1 (P1-02, decisão 0009 D-P1-02-3): só 5 faces pré-carregadas; o itálico
// tem família própria (`--font-sans-italic`) e é baixado só quando aparece.
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

  const preloads = await page
    .locator('link[rel="preload"][as="font"]')
    .evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href))
  expect(preloads).toHaveLength(5)

  // A família vem do CSS (`--font-sans`/`--font-mono`/`--font-sans-italic`,
  // primeira entrada), não do nome das constantes do layout. Carrega todas as
  // faces declaradas: a página inicial só usa algumas e as outras ficam
  // `unloaded`.
  const info = await page.evaluate(async () => {
    const unquote = (value: string) => value.replace(/^["']|["']$/g, '')
    const first = (list: string) => unquote(list.split(',')[0].trim())
    const style = getComputedStyle(document.body)
    const families = {
      sans: first(style.getPropertyValue('--font-sans')),
      mono: first(style.getPropertyValue('--font-mono')),
      italic: first(style.getPropertyValue('--font-sans-italic'))
    }
    const nameOf = (face: FontFace) =>
      Object.entries(families).find(
        ([, family]) => family === unquote(face.family)
      )?.[0]
    // Onde o navegador põe itálico (inclusive o `em` do Markdown), a face
    // real vem de --font-sans-italic, não de um itálico sintético.
    const italicTags = ['i', 'em', 'cite', 'dfn', 'var', 'address', 'blockquote']
    const italicFamilies = italicTags.map((tag) => {
      const element = document.body.appendChild(document.createElement(tag))
      const family = first(getComputedStyle(element).fontFamily)
      element.remove()
      return `${tag} ${family}`
    })
    const faces = [...document.fonts].filter((face) => nameOf(face))
    await Promise.all(faces.map((face) => face.load()))
    return {
      families,
      italicFamilies,
      bodyFamily: style.fontFamily,
      faces: faces.map(
        (face) => `${nameOf(face)} ${face.weight} ${face.style} ${face.status}`
      )
    }
  })

  const { sans, mono, italic } = info.families
  expect(sans).not.toBe('')
  expect(mono).not.toBe('')
  expect(italic).not.toBe('')
  expect(new Set([sans, mono, italic]).size).toBe(3)
  expect(info.bodyFamily.replace(/["']/g, '')).toMatch(
    new RegExp(`^${sans}(,|$)`)
  )
  expect(info.italicFamilies).toEqual(
    ['i', 'em', 'cite', 'dfn', 'var', 'address', 'blockquote'].map(
      (tag) => `${tag} ${italic}`
    )
  )
  expect(info.faces.sort()).toEqual([
    'italic 400 italic loaded',
    'mono 400 normal loaded',
    'mono 500 normal loaded',
    'sans 400 normal loaded',
    'sans 500 normal loaded',
    'sans 600 normal loaded'
  ])

  // As 6 faces vêm do app; só o itálico fica fora do preload.
  const requested = [...new Set(fontRequests)]
  expect(requested).toHaveLength(6)
  expect(requested.filter((url) => !preloads.includes(url))).toHaveLength(1)
  for (const url of [...preloads, ...fontRequests]) {
    const { origin, pathname } = new URL(url)
    expect(origin).toBe(APP_URL)
    expect(pathname).toMatch(/^\/_next\/static\/media\/.+\.woff2$/)
  }
  expect(external).toEqual([])
})
