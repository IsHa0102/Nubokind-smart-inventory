import { useEffect, useState } from "react"
import { fetchProducts, fetchMovementCountsSince, setProductStock } from "../api/inventoryApi"
import { buildSyncPlan, fetchSheetRows, SHEET_URL } from "../lib/sheetSync"

/**
 * Pulls the latest count from the warehouse Google Sheet ("Inventory Data" tab),
 * shows what would change, and applies the selected rows as recounts.
 *
 * Props: isOpen (bool), onClose (fn), onApplied (fn(summary)) — called after a sync.
 */
function SheetSyncModal({ isOpen, onClose, onApplied }) {
  const [status, setStatus] = useState("idle") // idle | loading | ready | applying | error
  const [error, setError] = useState("")
  const [plan, setPlan] = useState(null)
  const [moves, setMoves] = useState({})       // product_id → movements since count date
  const [selected, setSelected] = useState({}) // product_id → bool
  const [failures, setFailures] = useState([])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    ;(async () => {
      setStatus("loading"); setError(""); setPlan(null); setFailures([])
      try {
        const [rows, products] = await Promise.all([fetchSheetRows(), fetchProducts()])
        const p = buildSyncPlan(rows, products)
        let m = {}
        if (p.countDate && p.changes.length) {
          m = await fetchMovementCountsSince(p.changes.map((c) => c.product.id), p.countDate.toISOString())
        }
        if (cancelled) return
        setPlan(p)
        setMoves(m)
        // Pre-select every change except items with stock moves logged after the
        // count — the count may not include those, so a person should decide.
        setSelected(Object.fromEntries(p.changes.map((c) => [c.product.id, !m[c.product.id]])))
        setStatus("ready")
      } catch (e) {
        if (cancelled) return
        setError(e.message || String(e))
        setStatus("error")
      }
    })()
    return () => { cancelled = true }
  }, [isOpen])

  if (!isOpen) return null

  const chosen = plan ? plan.changes.filter((c) => selected[c.product.id]) : []
  const allChecked = plan && plan.changes.length > 0 && chosen.length === plan.changes.length

  const apply = async () => {
    setStatus("applying")
    const failed = []
    // One call per item. Each call sets an absolute value and is a no-op when the
    // stock already matches, so if anything fails, re-running the sync is safe.
    for (const c of chosen) {
      try {
        await setProductStock(c.product.id, c.next, `Warehouse sheet count (${plan.countLabel})`)
      } catch (e) {
        failed.push(`${c.product.name}: ${e.message}`)
      }
    }
    setFailures(failed)
    onApplied?.({ updated: chosen.length - failed.length, failed: failed.length, countLabel: plan.countLabel })
    if (failed.length) setStatus("ready")
    else onClose()
  }

  const busy = status === "loading" || status === "applying"

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={busy ? undefined : onClose}>
      <div
        className="relative mx-4 flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Sync from Warehouse Sheet</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {plan
                ? <>Latest count in sheet: <span className="font-semibold text-slate-700">{plan.countLabel}</span></>
                : "Reads the latest count from the “Inventory Data” tab."}
              {" · "}
              <a href={SHEET_URL} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">Open sheet</a>
            </p>
          </div>
          <button onClick={onClose} disabled={busy} className="text-slate-400 hover:text-slate-600 disabled:opacity-40" aria-label="Close">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {status === "loading" && <p className="py-8 text-center text-sm text-slate-400">Reading sheet…</p>}

          {status === "error" && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {failures.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <p className="font-semibold">Some items were not updated. Run the sync again to retry:</p>
              <ul className="mt-1 list-disc pl-5">{failures.map((f) => <li key={f}>{f}</li>)}</ul>
            </div>
          )}

          {plan && (
            <>
              {plan.changes.length === 0 ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  Inventory already matches the sheet. Nothing to update.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50">
                      <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={!!allChecked}
                            onChange={(e) => setSelected(Object.fromEntries(plan.changes.map((c) => [c.product.id, e.target.checked])))}
                            aria-label="Select all"
                          />
                        </th>
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2 text-right">Now</th>
                        <th className="px-3 py-2 text-right">Sheet</th>
                        <th className="px-3 py-2 text-right">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.changes.map((c) => (
                        <tr key={c.product.id} className="border-t border-slate-100">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={!!selected[c.product.id]}
                              onChange={(e) => setSelected((s) => ({ ...s, [c.product.id]: e.target.checked }))}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-medium text-slate-800">{c.product.name}</p>
                            <p className="text-xs text-slate-400">Sheet: {c.header}</p>
                            {moves[c.product.id] > 0 && (
                              <p className="mt-0.5 text-xs text-amber-600">
                                {moves[c.product.id]} stock move{moves[c.product.id] > 1 ? "s" : ""} logged on/after {plan.countLabel}. The count may not include them.
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500">{c.current}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">{c.next}</td>
                          <td className={`px-3 py-2 text-right tabular-nums font-semibold ${c.diff > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                            {c.diff > 0 ? `+${c.diff}` : c.diff}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {plan.invalid.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <p className="font-semibold">Skipped: not a plain number in the sheet</p>
                  <ul className="mt-1 list-disc pl-5">
                    {plan.invalid.map((r) => <li key={r.header}>{r.header}: “{r.raw}”</li>)}
                  </ul>
                </div>
              )}

              {(plan.unlinkedHeaders.length > 0 || plan.missingProducts.length > 0) && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  {plan.unlinkedHeaders.length > 0 && (
                    <p><span className="font-semibold">Sheet columns not linked to an item:</span> {plan.unlinkedHeaders.join(", ")}</p>
                  )}
                  {plan.missingProducts.length > 0 && (
                    <p className="mt-1"><span className="font-semibold">Linked items missing in inventory:</span> {plan.missingProducts.join(", ")}</p>
                  )}
                </div>
              )}

              <p className="text-xs text-slate-400">
                {plan.unchanged.length} already match · {plan.blank.length} blank in sheet (left as is)
              </p>
            </>
          )}
        </div>

        <div className="flex gap-3 border-t border-slate-100 px-6 py-4">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            {plan?.changes.length ? "Cancel" : "Close"}
          </button>
          {plan?.changes.length > 0 && (
            <button
              onClick={apply}
              disabled={busy || chosen.length === 0}
              className="flex-1 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              {status === "applying" ? "Updating…" : `Update ${chosen.length} item${chosen.length === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default SheetSyncModal
