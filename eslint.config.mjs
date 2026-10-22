import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname
})

// P1-04b (R8): texto fixo que o jsx-no-literals e um seletor não alcançam,
// porque fica dentro de `?:`, `||`/`&&` ou template literal, em qualquer
// profundidade. Vale nos filhos JSX (o texto direto já é do jsx-no-literals),
// nos atributos lidos pelo usuário e nos argumentos de toast.*() e de
// setStreamingErrorMessage(), inclusive valores de chaves de texto em objeto
// (`{ description }`), também aninhados (`action.label`); as outras chaves
// (id, kind, position…) e toast.dismiss(id) ficam de fora. P1-05: as props de
// texto dos componentes próprios (text, label, description, hint, detail)
// valem como atributos lidos.
const TEXT_ATTRIBUTE =
  /^(aria-label|placeholder|title|alt|text|label|description|hint|detail)$/
const TEXT_KEY = /^(description|loading|success|error|label|detail|message|title)$/
const isWrapper = (node, child) =>
  (node.type === 'ConditionalExpression' && node.test !== child) ||
  node.type === 'LogicalExpression' ||
  node.type === 'TemplateLiteral'
const isTextCall = ({ callee }) =>
  (callee.type === 'Identifier' &&
    (callee.name === 'toast' || callee.name === 'setStreamingErrorMessage')) ||
  (callee.type === 'MemberExpression' &&
    callee.object.name === 'toast' &&
    callee.property.name !== 'dismiss')

const uiText = {
  rules: {
    'no-literal': {
      meta: {
        type: 'problem',
        schema: [],
        messages: {
          literal: 'Texto de UI vem do catálogo (useTranslations), não literal.'
        }
      },
      create(context) {
        const check = (node, text) => {
          if (typeof text !== 'string' || !/\p{L}/u.test(text)) return
          let outer = node
          let branched = false
          let inObject = false
          for (;;) {
            const parent = outer.parent
            if (isWrapper(parent, outer)) {
              branched ||= parent.type !== 'TemplateLiteral'
              outer = parent
            } else if (parent.type === 'Property' && parent.value === outer) {
              const isTextKey = TEXT_KEY.test(parent.key.name ?? parent.key.value)
              if (!isTextKey && !inObject) return
              inObject = true
              outer = parent.parent
            } else break
          }
          const sink = outer.parent
          const reported =
            sink.type === 'CallExpression'
              ? sink.arguments.includes(outer) && isTextCall(sink)
              : sink.type === 'JSXExpressionContainer' &&
                !inObject &&
                (sink.parent.type === 'JSXAttribute'
                  ? TEXT_ATTRIBUTE.test(sink.parent.name.name)
                  : branched)
          if (reported) context.report({ node, messageId: 'literal' })
        }
        return {
          Literal: (node) => check(node, node.value),
          TemplateElement: (node) => check(node, node.value.raw)
        }
      }
    }
  }
}

// Fontes servidas de src/app/fonts (decisões 0004 e 0008): nada de Google Fonts.
const noGoogleFonts = {
  name: 'next/font/google',
  message: 'Use next/font/local com os arquivos de src/app/fonts (decisão 0008).'
}

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      'no-restricted-imports': ['error', { paths: [noGoogleFonts] }]
    }
  },
  {
    // P2-01: src/server (env, chaves, sessão) só no servidor. Nas pastas do
    // cliente o lint recusa o import; nas demais, o 'server-only' quebra o build.
    files: [
      'src/components/**',
      'src/hooks/**',
      'src/lib/**',
      'src/api/**',
      'src/store.ts'
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [noGoogleFonts],
          patterns: [
            {
              group: ['@/server', '@/server/*', '**/server/*'],
              message: 'src/server é só do servidor (CLAUDE.md, P2-01).'
            }
          ]
        }
      ]
    }
  },
  {
    // P1-04 e P1-04b: texto de UI só pelo catálogo (messages/*.json) nas
    // pastas migradas. Props como className ficam de fora; os atributos lidos
    // pelo usuário são cobertos pelas regras abaixo.
    files: [
      'src/app/**/*.tsx',
      'src/components/layout/**/*.tsx',
      'src/components/management/**/*.tsx',
      'src/components/playground/**/*.tsx',
      'src/hooks/**/*.{ts,tsx}',
      'src/store.ts'
    ],
    plugins: { 'ui-text': uiText },
    rules: {
      'ui-text/no-literal': 'error',
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
            'JSXAttribute[name.name=/^(aria-label|placeholder|title|alt|text|label|description|hint|detail)$/] > Literal',
          message: 'Texto de UI vem do catálogo (useTranslations), não literal.'
        }
      ]
    }
  }
]

export default eslintConfig
