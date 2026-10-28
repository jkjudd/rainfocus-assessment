import { createContext, useContext } from 'react'

export const ToastContext = createContext(null)
export const DismissToastContext = createContext(() => {})

// A modal <dialog> makes everything outside it inert, so an open modal registers
// itself as the toast host and toasts render inside it, where they stay visible,
// clickable and announced. registerToastHost(element) returns an unregister fn.
export const ToastHostContext = createContext(() => () => {})

// Returns showToast(message, { type: 'error' | 'success' }), which returns the
// toast's id.
export function useToast() {
  const showToast = useContext(ToastContext)
  if (!showToast) throw new Error('useToast must be used inside <ToastProvider>.')
  return showToast
}

// Returns dismissToast(id): removes a toast whose context has ended, such as an
// error from a modal that has since closed. Unknown or null ids are ignored.
export function useDismissToast() {
  return useContext(DismissToastContext)
}

export function useToastHost() {
  return useContext(ToastHostContext)
}
