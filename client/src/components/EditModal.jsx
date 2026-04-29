import { useEffect, useRef, useState } from "react"

/**
 * EditModal — a generic modal for inline editing a single text field or a product form.
 *
 * Props:
 *   isOpen       (bool)
 *   title        (string)
 *   fields       (array of { key, label, type, min, required })
 *   initialValues (object)  — { key: value }
 *   onSave       (fn(values))
 *   onClose      (fn)
 *   saving       (bool)
 */
function EditModal({ isOpen, title, fields, initialValues, onSave, onClose, saving }) {
  const [values, setValues] = useState(initialValues || {})
  const firstRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setValues(initialValues || {})
      setTimeout(() => firstRef.current?.focus(), 80)
    }
  }, [isOpen, initialValues])

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(values)
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative mx-4 w-full max-w-md rounded-2xl bg-white shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map((field, idx) => (
            <div key={field.key}>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                {field.label}
              </label>
              {field.type === 'select' ? (
                <select
                  ref={idx === 0 ? firstRef : undefined}
                  required={field.required !== false}
                  value={values[field.key] ?? ""}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 transition"
                >
                  {field.options.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              ) : (
                <input
                  ref={idx === 0 ? firstRef : undefined}
                  type={field.type || "text"}
                  min={field.min}
                  required={field.required !== false}
                  value={values[field.key] ?? ""}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 transition"
                />
              )}
            </div>
          ))}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EditModal
