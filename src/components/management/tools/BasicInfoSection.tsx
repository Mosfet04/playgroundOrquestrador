'use client'

import type { UseFormReturn } from 'react-hook-form'
import { useTranslations } from 'next-intl'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { TextArea } from '@/components/ui/textarea'
import { FieldError } from '../common/FieldError'
import { SectionCard } from '../common/SectionCard'
import type { ToolFormValues } from './toolFormValues'

// Informações básicas da tool: identidade, instruções e se está ativa.
export function BasicInfoSection({
  form,
  isEditing,
  readOnly
}: {
  form: UseFormReturn<ToolFormValues>
  isEditing: boolean
  readOnly: boolean
}) {
  const t = useTranslations('tools.form')
  const tc = useTranslations('common')
  const { register, watch, setValue, formState } = form
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
            disabled={isEditing}
            placeholder={tc('example', { value: 'weather-api' })}
          />
          <FieldError message={errors.id?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">{t('name')}</Label>
          <Input
            id="name"
            {...register('name', { required: tc('nameRequired') })}
            placeholder={tc('example', { value: 'Weather API' })}
          />
          <FieldError message={errors.name?.message} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">{t('description')}</Label>
        <TextArea
          id="description"
          {...register('description', {
            validate: (value) => value.trim() !== '' || tc('descriptionRequired')
          })}
          placeholder={t('descriptionPlaceholder')}
          rows={3}
        />
        <FieldError message={errors.description?.message} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="instructions">{t('instructions')}</Label>
        <TextArea
          id="instructions"
          {...register('instructions')}
          placeholder={t('instructionsPlaceholder')}
          rows={2}
        />
        <FieldError message={errors.instructions?.message} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <Label htmlFor="active">{t('active')}</Label>
          <Switch
            id="active"
            checked={watch('active')}
            disabled={readOnly}
            onCheckedChange={(checked) => setValue('active', checked)}
          />
        </div>
        <FieldError message={errors.active?.message} />
      </div>
    </SectionCard>
  )
}
