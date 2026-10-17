import { type FC } from 'react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

interface DeleteSessionModalProps {
  isOpen: boolean
  onClose: () => void
  onDelete: () => Promise<void>
  isDeleting: boolean
}

const DeleteSessionModal: FC<DeleteSessionModalProps> = ({
  isOpen,
  onClose,
  onDelete,
  isDeleting
}) => {
  const t = useTranslations('playground')
  const tc = useTranslations('common')
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="font-sans">
        <DialogHeader>
          <DialogTitle>{t('deleteSessionTitle')}</DialogTitle>
          <DialogDescription>{t('deleteSessionDescription')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            className="border-border font-sans uppercase"
            onClick={onClose}
            disabled={isDeleting}
          >
            {tc('cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={onDelete}
            disabled={isDeleting}
            className="font-sans uppercase"
          >
            {tc('delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default DeleteSessionModal
