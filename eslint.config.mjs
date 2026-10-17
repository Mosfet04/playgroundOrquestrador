import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname
})

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    // Fontes servidas de src/app/fonts (decisões 0004 e 0008): nada de Google Fonts.
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'next/font/google',
              message:
                'Use next/font/local com os arquivos de src/app/fonts (decisão 0008).'
            }
          ]
        }
      ]
    }
  },
  {
    // P1-04: texto de UI só pelo catálogo (messages/*.json) nas pastas já
    // migradas; o /playground entra no P1-04b. Props como className ficam de
    // fora; os atributos lidos pelo usuário são cobertos pela regra abaixo.
    files: [
      'src/app/**/*.tsx',
      'src/components/layout/**/*.tsx',
      'src/components/management/**/*.tsx'
    ],
    rules: {
      'react/jsx-no-literals': [
        'error',
        {
          noStrings: true,
          ignoreProps: true,
          // Separadores (trilha, "chave: valor") e emoji decorativo do GettingStarted.
          allowedStrings: ['›', ':', '🎉']
        }
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'JSXAttribute[name.name=/^(aria-label|placeholder|title|alt)$/] > Literal',
          message: 'Texto de UI vem do catálogo (useTranslations), não literal.'
        },
        {
          // O jsx-no-literals não olha dentro de `?:`, `||` e `&&` nos filhos
          // JSX (`{x || 'N/A'}`); até dois níveis, fora de atributos.
          selector:
            ':matches(JSXElement, JSXFragment) > JSXExpressionContainer > :matches(ConditionalExpression, LogicalExpression) > Literal[value=/\\p{L}/u], :matches(JSXElement, JSXFragment) > JSXExpressionContainer > :matches(ConditionalExpression, LogicalExpression) > :matches(ConditionalExpression, LogicalExpression) > Literal[value=/\\p{L}/u]',
          message: 'Texto de UI vem do catálogo (useTranslations), não literal.'
        }
      ]
    }
  }
]

export default eslintConfig
