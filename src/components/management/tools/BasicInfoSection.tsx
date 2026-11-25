'use client'

import type { UseFormReturn } from 'react-hook-form'
import { useTranslations } from 'next-intl'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TextArea } from '@/components/ui/textarea'
import { errorA11y, FieldError } from '../common/FieldError'
import { SectionCard } from '../common/SectionCard'
import type { ToolFormValues } from './toolFormValues'

// Informações básicas da tool: identidade e instruções (o estado ativo é do Desativar/Reativar, P3-06).
export function BasicInfoSection({
  form,
  isEditing
}: {
  form: UseFormReturn<ToolFormValues>
  isEditing: boolean
}) {
  const t = useTranslations('tools.form')
  const tc = useTranslations('common')
  const { register, formState } = form
  const { errors } = formState

  return (
    <SectionCard
      id="tool-basic"
      title={t('basicInfo')}
      description={t('basicInfoDescription')}
      className="min-w-0 xl:col-start-1"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="id">{t('id')}</Label>
          <Input
            id="id"
            {...register('id', { required: tc('idRequired') })}
            {...errorA11y('id', !!errors.id)}
            disabled={isEditing}
            placeholder={tc('example', { value: 'weather-api' })}
          />
          <FieldError id="id-error" message={errors.id?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">{t('name')}</Label>
          <Input
            id="name"
            {...register('name', { required: tc('nameRequired') })}
            {...errorA11y('name', !!errors.name)}
            placeholder={tc('example', { value: 'Weather API' })}
          />
          <FieldError id="name-error" message={errors.name?.message} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">{t('description')}</Label>
        <TextArea
          id="description"
          {...register('description', {
            validate: (value) => value.trim() !== '' || tc('descriptionRequired')
          })}
          {...errorA11y('description', !!errors.description)}
          placeholder={t('descriptionPlaceholder')}
        />
        <FieldError id="description-error" message={errors.description?.message} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="instructions">{t('instructions')}</Label>
        <TextArea
          id="instructions"
          {...register('instructions')}
          {...errorA11y('instructions', !!errors.instructions)}
          placeholder={t('instructionsPlaceholder')}
        />
        <FieldError id="instructions-error" message={errors.instructions?.message} />
      </div>
    </SectionCard>
  )
}
