import type { ReactNode } from 'react'
import { FormDialog } from './FormDialog'

interface Props {
  open: boolean
  title: string
  confirmLabel: string
  /** The label that keeps things as they are. Says what it keeps when "Cancel" would be confusing. */
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => Promise<unknown>
  onClose: () => void
  children?: ReactNode
}

/** A question with a plain answer: the confirmations that only need a sentence and two buttons. */
export function ConfirmDialog({ open, title, confirmLabel, cancelLabel, danger, onConfirm, onClose, children }: Props) {
  return (
    <FormDialog open={open} title={title} submitLabel={confirmLabel} cancelLabel={cancelLabel} danger={danger} onClose={onClose} onSubmit={onConfirm}>
      {children}
    </FormDialog>
  )
}
