/**
 * ConfirmModal — a portal-less modal asking the user to confirm a destructive action.
 *
 * Props:
 *   isOpen     (bool)
 *   title      (string)
 *   message    (string)
 *   onConfirm  (fn)
 *   onCancel   (fn)
 *   confirmLabel (string, default "Delete")
 *   danger     (bool, default true) — makes confirm button red
 */
function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, confirmLabel = "Delete", danger = true }) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="relative mx-4 w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${danger ? "bg-red-100" : "bg-amber-100"}`}>
          <svg className={`h-6 w-6 ${danger ? "text-red-600" : "text-amber-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>

        <h3 className="text-center text-base font-bold text-slate-900 mb-1">{title}</h3>
        <p className="text-center text-sm text-slate-500 mb-6">{message}</p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors ${
              danger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-amber-500 hover:bg-amber-600"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal
