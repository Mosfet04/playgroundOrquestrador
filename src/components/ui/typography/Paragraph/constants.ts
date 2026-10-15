import { type ParagraphSizeMap } from './types'

export const PARAGRAPH_SIZES: ParagraphSizeMap = {
  xs: 'text-xs',
  sm: 'text-sm',
  default: 'text-base',
  lg: 'text-lg',
  lead: 'text-[1.125rem] font-medium leading-[1.35rem] tracking-[-0.01em] ',
  title: 'text-[0.875rem] font-medium leading-5 tracking-[-0.02em]',
  body: 'text-[0.875rem] font-normal leading-5 tracking-[-0.02em]',
  mono: 'font-mono text-[0.75rem] font-normal leading-[1.125rem] tracking-[-0.02em]',
  xsmall:
    'text-[0.75rem] font-normal leading-[1.0625rem] tracking-[-0.02em]'
}
