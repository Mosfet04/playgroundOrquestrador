import { type FC } from 'react'

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
}) => (
  <Dialog open={isOpen} onOpenChange={onClose}>
    <DialogContent className="font-sans">
      <DialogHeader>
        <DialogTitle>Confirm deletion</DialogTitle>
        <DialogDescription>
          This will permanently delete the session. This action cannot be
          undone.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button
          variant="outline"
          className="rounded-xl border-border font-sans"
          onClick={onClose}
          disabled={isDeleting}
        >
          CANCEL
        </Button>
        <Button
          variant="destructive"
          onClick={onDelete}
          disabled={isDeleting}
          className="rounded-xl font-sans"
        >
          DELETE
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)

export default DeleteSessionModal
