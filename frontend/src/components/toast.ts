import { createContext, useContext } from 'react'

export interface Toast {
  message: string
  /** Puts things back. Offered as an "Undo" button while the message is showing. */
  undo?: () => Promise<unknown> | unknown
}
export type ShowToast = (toast: Toast) => void

export const ToastContext = createContext<ShowToast>(() => undefined)

/** Say what just happened, once, at the bottom of the screen, with an Undo when there is one. Outside a provider it does nothing. */
export const useToast = (): ShowToast => useContext(ToastContext)
