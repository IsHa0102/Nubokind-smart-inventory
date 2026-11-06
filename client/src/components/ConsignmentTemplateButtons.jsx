import { useRef, useState } from "react"
import { downloadConsignmentTemplate, parseConsignmentFile } from "../lib/consignmentTemplate"

// ── Excel template buttons ─────────────────────────────────────────────────
export default function TemplateButtons({ destinations, onLoaded, prefill }) {
  const inputRef = useRef(null)
  const [errors, setErrors] = useState([])
  const [busy, setBusy] = useState(false)

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setBusy(true)
    setErrors([])
    const parsed = await parseConsignmentFile(file, destinations)
    setBusy(false)
    if (parsed.errors?.length) { setErrors(parsed.errors); return }
    onLoaded(parsed)
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-600 mr-1">Excel</span>
        <button
          type="button"
          onClick={() => downloadConsignmentTemplate(destinations, prefill)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          ⬇ Download template
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
        >
          {busy ? "Reading…" : "⬆ Upload filled template"}
        </button>
        <input ref={inputRef} type="file" accept=".xlsx" onChange={onFile} className="hidden" />
        <span className="text-[11px] text-slate-400">Uploading fills this form — you still review before saving.</span>
      </div>
      {errors.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-rose-600 space-y-0.5">
          {errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
    </div>
  )
}
