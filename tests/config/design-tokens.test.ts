// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import { describe, expect, it } from 'vitest'

import tailwindConfig from '../../tailwind.config'

// P1-02 (QA): os tokens do código = tokens.json do P1-01, os pares de contraste
// da spec passam AA, e os requisitos R2-R6 / V-P1-02-2 valem no código-fonte.
const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

type Theme = 'light' | 'dark'
type Rgb = [number, number, number]

const hslToRgb = (channels: string): Rgb => {
  const [h, s, l] = channels.match(/-?[\d.]+/g)!.map(Number)
  const sat = s / 100
  const light = l / 100
  const chroma = (1 - Math.abs(2 * light - 1)) * sat
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = light - chroma / 2
  const [r, g, b] =
    h < 60
      ? [chroma, x, 0]
      : h < 120
        ? [x, chroma, 0]
        : h < 180
          ? [0, chroma, x]
          : h < 240
            ? [0, x, chroma]
            : h < 300
              ? [x, 0, chroma]
              : [chroma, 0, x]
  return [r, g, b].map((v) => Math.round((v + m) * 255)) as Rgb
}
const hexToRgb = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const luminance = (rgb: Rgb) => {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// Variáveis de cor de um bloco do globals.css (`:root` = claro, `.dark` = escuro).
const css = read('src/app/globals.css')
const block = (selector: string) => {
  const start = css.indexOf(`${selector} {`)
  const body = css.slice(start, css.indexOf('\n  }', start))
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v])
  )
}
const vars: Record<Theme, Record<string, string>> = {
  light: block(':root'),
  dark: block('.dark')
}

type TokenDef = { name: string; value: string | Record<Theme, string> }
const defs: TokenDef[] = JSON.parse(read('docs/design/P1-01/tokens.json')).color
  .tokens
const expectedHex = (name: string, theme: Theme): string => {
  const def = defs.find((d) => d.name === name)!
  if (typeof def.value === 'string')
    return expectedHex(def.value.replace(/[{}]/g, ''), theme)
  return def.value[theme]
}
const codeRgb = (name: string, theme: Theme) => hslToRgb(vars[theme][name])

describe('V-P1-02-1: tokens do código = P1-01/tokens.json', () => {
  it.each(['light', 'dark'] as const)('tema %s', (theme) => {
    expect(defs.length).toBe(23)
    for (const { name } of defs) {
      const want = hexToRgb(expectedHex(name, theme))
      const got = codeRgb(name, theme)
      // O HSL do CSS tem 1 casa decimal: tolera 2/255 por canal.
      got.forEach((channel, i) =>
        expect(
          Math.abs(channel - want[i]),
          `${name} (${theme}) ${got} vs ${want}`
        ).toBeLessThanOrEqual(2)
      )
    }
  })
})

describe('contraste AA dos pares da spec (design-system.md)', () => {
  const rows = [
    ...read('docs/design/design-system.md').matchAll(
      /^\| `([\w-]+)` \| `([\w-]+)` \| [^|]+\| ([\d,]+) \| ([\d,]+) ✓ \| ([\d,]+) ✓ \|$/gm
    )
  ].map(([, fg, bg, min, light, dark]) => ({
    fg,
    bg,
    min: Number(min.replace(',', '.')),
    table: {
      light: Number(light.replace(',', '.')),
      dark: Number(dark.replace(',', '.'))
    }
  }))

  it('lê a tabela inteira (48 pares)', () => {
    expect(rows).toHaveLength(48)
  })

  it.each(['light', 'dark'] as const)(
    'todo par atinge o mínimo e bate com a tabela no tema %s',
    (theme) => {
      for (const { fg, bg, min, table } of rows) {
        const ratio = contrast(codeRgb(fg, theme), codeRgb(bg, theme))
        expect(ratio, `${fg} sobre ${bg} (${theme})`).toBeGreaterThanOrEqual(
          min
        )
        expect(
          Math.abs(ratio - table[theme]),
          `${fg}/${bg} ${theme}`
        ).toBeLessThan(0.06)
      }
    }
  )

  it('séries dos gráficos (D-P1-02-1): primary e muted-foreground passam 3:1 sobre card', () => {
    for (const theme of ['light', 'dark'] as const)
      for (const series of ['primary', 'muted-foreground'])
        expect(
          contrast(codeRgb(series, theme), codeRgb('card', theme)),
          `${series} (${theme})`
        ).toBeGreaterThanOrEqual(3)
  })
})

const walk = (dir: string): string[] =>
  readdirSync(join(root, dir)).flatMap((entry) => {
    const rel = join(dir, entry)
    return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel]
  })
const srcFiles = walk('src').filter(
  (f) => /\.(tsx?|css)$/.test(f) && f !== 'src/app/globals.css'
)
const hits = (pattern: RegExp, files = srcFiles) =>
  files.flatMap((file) =>
    read(file)
      .split('\n')
      .flatMap((line, i) =>
        pattern.test(line) ? [`${file}:${i + 1}: ${line.trim()}`] : []
      )
  )

describe('V-P1-02-2: sem cor solta em src/ (spec: nenhuma exceção)', () => {
  it.each([
    ['hex', /#[0-9a-fA-F]{3,8}\b/],
    [
      'bg-black / text-white / border-white / bg-white / text-black',
      /\b(bg-black|text-white|border-white|bg-white|text-black)\b/
    ],
    ['fill/stroke white', /(fill|stroke)="white"/],
    ['rgb()/rgba()', /\brgba?\(/],
    [
      'paleta crua do Tailwind',
      /\b(bg|text|border|ring|fill|stroke|from|to|via|divide|outline|shadow)-(gray|green|blue|red|neutral|slate|zinc|orange|yellow|amber|emerald|sky|indigo|violet|purple|pink|rose|stone)-\d/
    ]
  ])('%s', (_name, pattern) => {
    expect(hits(pattern)).toEqual([])
  })

  it('globals.css só tem rgb()/hex fora dos tokens (nenhum)', () => {
    expect(css).not.toMatch(/rgba?\(/)
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(
      /#[0-9a-fA-F]{3,8}\b/
    )
  })
})

describe('R3-R4: limpeza do que a spec mandou sair', () => {
  it('R3: sem font-inter', () => expect(hits(/font-inter/)).toEqual([]))
  it('R4: sem breakpoints e utilitários mobile próprios', () => {
    expect(hits(/[\s"'`](xs|s23):[a-z\[-]/)).toEqual([])
    expect(css).not.toMatch(
      /mobile-container|mobile-text-adjust|mobile-touch-target|s23-optimized|width:\s*412px/
    )
    expect(tailwindConfig.theme.extend).not.toHaveProperty('screens')
  })
  it('R4: tokens antigos fora do Tailwind', () => {
    const colors = tailwindConfig.theme.extend.colors as Record<string, unknown>
    for (const gone of ['primaryAccent', 'brand', 'positive'])
      expect(colors).not.toHaveProperty(gone)
    expect(colors).not.toHaveProperty('background.secondary')
    expect(tailwindConfig.theme.extend.borderRadius).not.toHaveProperty('xl')
    expect(
      hits(
        /\b(primaryAccent|bg-brand|text-brand|bg-positive|background-secondary)\b/
      )
    ).toEqual([])
  })
})

describe('R6: Tailwind com alfa sobre hsl(var(--token))', () => {
  it('bg-primary/10 e shadow-glow geram CSS válido', async () => {
    const result = await postcss([
      tailwindcss({
        ...tailwindConfig,
        content: [
          {
            raw: 'bg-primary/10 text-muted-foreground border-border bg-primary-soft shadow-glow rounded-md'
          }
        ]
      })
    ]).process('@tailwind utilities;', { from: undefined })
    expect(result.css).toMatch(
      /\.bg-primary\\\/10\s*{[^}]*hsl\(var\(--primary\)\s*\/\s*0\.1\)/
    )
    expect(result.css).toMatch(
      /\.text-muted-foreground\s*{[^}]*hsl\(var\(--muted-foreground\)/
    )
    expect(result.css).toMatch(
      /\.bg-primary-soft\s*{[^}]*hsl\(var\(--primary-soft\)/
    )
    expect(result.css).toMatch(/\.shadow-glow\s*{[^}]*var\(--shadow-glow\)/)
    expect(result.css).toMatch(
      /\.rounded-md\s*{[^}]*calc\(var\(--radius\) - 2px\)/
    )
  })
})
