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
  }
]

export default eslintConfig
