import { useEffect, useState } from "react"

/**
 * Toast notification component.
 * Props: message (string), type ("success"|"error"|"warning"), onClose (fn)
 */
function Toast({ message, type = "success", onClose }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Slide in
    const showTimer = setTimeout(() => setVisible(true), 10)
    // Auto-dismiss after 3.5 s
    const hideTimer = setTimeout(() => {
      setVisible(false)
      setTimeout(onClose, 300)
    }, 3500)
    return () => {
      clearTimeout(showTimer)
      clearTimeout(hideTimer)
    }
  }, [onClose])

  const colors = {
    success: "bg-emerald-50 border-emerald-400 text-emerald-800",
    error: "bg-red-50 border-red-400 text-red-800",
    warning: "bg-amber-50 border-amber-400 text-amber-800",
  }

  const icons = {
    success: (
      <svg className="h-5 w-5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    ),
    error: (
      <svg className="h-5 w-5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    warning: (
      <svg className="h-5 w-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    ),
  }

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg transition-all duration-300 ${colors[type]} ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
      }`}
    >
      {icons[type]}
      <p className="text-sm font-medium leading-snug">{message}</p>
      <button
        onClick={() => { setVisible(false); setTimeout(onClose, 300) }}
        className="ml-auto -mr-1 -mt-0.5 rounded p-0.5 opacity-60 hover:opacity-100 transition-opacity"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

/**
 * ToastContainer — renders a stack of toasts at top-right.
 * Pass `toasts` array and `removeToast(id)` fn from useToasts().
 */
export function ToastContainer({ toasts, removeToast }) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-80">
      {toasts.map((t) => (
        <Toast key={t.id} message={t.message} type={t.type} onClose={() => removeToast(t.id)} />
      ))}
    </div>
  )
}

/**
 * useToasts hook — manages toast state.
 * Returns { toasts, addToast, removeToast }
 */
export function useToasts() {
  const [toasts, setToasts] = useState([])

  const addToast = (message, type = "success") => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, message, type }])
  }

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  return { toasts, addToast, removeToast }
}

export default Toast
