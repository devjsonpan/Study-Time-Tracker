// Reusable confirmation modal — shown before any destructive action (delete).
// Rendered as a fixed overlay; caller controls open state and callbacks.

import type { PageTheme } from '../lib/themes'

type Props = {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
  theme: PageTheme
}

export default function ConfirmModal({
  isOpen, title, message, confirmLabel = 'Delete', onConfirm, onCancel, theme,
}: Props) {
  if (!isOpen) return null

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(15, 23, 42, 0.35)' }}
      onClick={onCancel}
    >
      {/* Card — stopPropagation so clicking inside doesn't close */}
      <div
        className="bg-white rounded-2xl shadow-xl px-7 py-6 w-full max-w-sm mx-4"
        style={{ border: `1px solid ${theme.border}` }}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-base font-extrabold text-slate-800 mb-1">{title}</h2>
        <p className="text-sm text-slate-400 font-medium mb-5">{message}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="btn-secondary px-4 py-2 rounded-xl text-sm font-bold cursor-pointer"
            style={{ background: theme.activeBg, color: theme.accent }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="btn-primary px-4 py-2 rounded-xl text-sm font-bold text-white cursor-pointer"
            style={{ background: '#F43F5E' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
