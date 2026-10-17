import { memo, useState } from 'react'
import { useTranslations } from 'next-intl'

import { type ImageData } from '@/types/playground'
import { cn, isValidUrl } from '@/lib/utils'

// A URL vem da saída do agente: o fallback a mostra como texto (sem innerHTML)
// e só vira link se for http(s) (nada de javascript:).
const ImageItem = ({ image }: { image: ImageData }) => {
  const [error, setError] = useState(false)
  const t = useTranslations('playground')

  if (error) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-md bg-muted text-muted-foreground">
        <p className="text-foreground">{t('imageUnavailable')}</p>
        {isValidUrl(image.url) ? (
          <a
            href={image.url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full max-w-md truncate p-2 text-center text-xs text-foreground underline"
          >
            {image.url}
          </a>
        ) : (
          <p className="w-full max-w-md truncate p-2 text-center text-xs text-foreground">
            {image.url}
          </p>
        )}
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image.url}
      alt={image.revised_prompt || t('imageAlt')}
      className="w-full rounded-lg"
      onError={() => setError(true)}
    />
  )
}

const Images = ({ images }: { images: ImageData[] }) => (
  <div
    className={cn(
      'grid max-w-xl gap-4',
      images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'
    )}
  >
    {images.map((image) => (
      <div key={image.url} className="group relative">
        <ImageItem image={image} />
      </div>
    ))}
  </div>
)

export default memo(Images)

Images.displayName = 'Images'
