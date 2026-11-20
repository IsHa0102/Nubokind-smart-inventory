import { useState } from "react"
import { resolveSheetDiff } from "../api/inventoryApi"
import { SHEET_URL } from "../lib/sheetSync"

const fmtDiff = (n) => (n > 0 ? `+${n}` : String(n))

/**
 * Differences between system stock and the warehouse sheet count.
 *
 * The comparison is made at the count date: system stock then = stock now
 * minus everything logged after the count day. So a consignment that went out
 * after the count doesn't show as a gap. For each item a person either accepts
 * the sheet (stock is recounted to sheet + moves since, logged in History) or
 * keeps the system number.
 *
 * Props: isOpen, onClose, products, recon ({ [id]: row }), plan (sheet parse, for
 *        skipped cells), onResolved() — reload after any change.
 */
export default function SheetReconcileModal({ isOpen, onClose, products, recon, plan, onResolved }) {
  const [busyId, setBusyId] = useState(null)
  const [errors, setErrors] = useState({})
  const [confirmAll, setConfirmAll] = useState(false)

  if (!isOpen) return null

  const rows = products
    .filter((p) => recon[p.id] && recon[p.id].diff !== 0)
    .map((p) => ({ product: p, r: recon[p.id] }))
    .sort((a, b) => (a.r.sheet_status === "open" ? 0 : 1) - (b.r.sheet_status === "open" ? 0 : 1)
      || Math.abs(b.r.diff) - Math.abs(a.r.diff))
  const open = rows.filter((x) => x.r.sheet_status === "open")

  const resolve = async (id, action) => {
    setBusyId(id)
    setErrors((e) => ({ ...e, [id]: null }))
    try {
      await resolveSheetDiff(id, action)
      await onResolved()
    } catch (err) {
      setErrors((e) => ({ ...e, [id]: err.message }))
    } finally {
      setBusyId(null)
    }
  }

  const acceptAll = async () => {
    setConfirmAll(false)
    setBusyId("all")
    const errs = {}
    // One at a time: each is its own transaction and recomputes its own diff.
    for (const { product } of open) {
      try { await resolveSheetDiff(product.id, "accept") }
      catch (err) { errs[product.id] = err.message }
    }
    setErrors(errs)
    await onResolved()
    setBusyId(null)
  }

  const busy = busyId !== null
  const countLabel = open[0]?.r.sheet_count_label || rows[0]?.r.sheet_count_label

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={busy ? undefined : onClose}>
      <div className="relative mx-4 flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">System stock vs warehouse sheet</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {countLabel ? <>Sheet count: <span className="font-semibold text-slate-700">{countLabel}</span> · </> : null}
              Compared at the end of the count day, so moves logged after it are carried forward.{" "}
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
          {rows.length === 0 ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              System stock matches the sheet for every counted item.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 text-right" title="System stock at the end of the count day">System then</th>
                    <th className="px-3 py-2 text-right">Sheet count</th>
                    <th className="px-3 py-2 text-right">Diff</th>
                    <th className="px-3 py-2 text-right" title="Net stock logged after the count day">Moved since</th>
                    <th className="px-3 py-2 text-right">System now</th>
                    <th className="px-3 py-2 text-right">If accepted</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ product, r }) => {
                    const resolved = r.sheet_status !== "open"
                    return (
                      <tr key={product.id} className={`border-t border-slate-100 ${resolved ? "opacity-60" : ""}`}>
                        <td className="px-3 py-2">
                          <p className="font-medium text-slate-800">{product.name}</p>
                          {errors[product.id] && <p className="text-xs text-rose-600">{errors[product.id]}</p>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.system_at_count}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">{r.sheet_stock}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-semibold ${r.diff > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {fmtDiff(r.diff)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.moved_since ? fmtDiff(r.moved_since) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.stock}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-indigo-700">
                          {resolved ? "—" : r.stock + r.diff}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {resolved ? (
                            <span className="text-xs font-medium text-slate-500">
                              {r.sheet_status === "accepted" ? "✓ Accepted" : "Kept system"}
                            </span>
                          ) : (
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => resolve(product.id, "accept")}
                                disabled={busy}
                                className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
                              >
                                {busyId === product.id ? "…" : "Use sheet"}
                              </button>
                              <button
                                onClick={() => resolve(product.id, "ignore")}
                                disabled={busy}
                                className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                              >
                                Keep system
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {plan?.invalid?.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="font-semibold">Not compared: not a plain number in the sheet</p>
              <ul className="mt-1 list-disc pl-5">
                {plan.invalid.map((r) => <li key={r.header}>{r.header}: “{r.raw}”</li>)}
              </ul>
            </div>
          )}
          {(plan?.unlinkedHeaders?.length > 0 || plan?.missingProducts?.length > 0) && (
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
            “Use sheet” sets stock to the sheet count plus everything moved since, and logs it in History as a recount.
            “Keep system” leaves stock alone. A newer count in the sheet reopens the item.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-6 py-4">
          {confirmAll ? (
            <>
              <span className="text-sm text-slate-700">Set {open.length} item{open.length !== 1 ? "s" : ""} to the sheet count?</span>
              <button onClick={acceptAll} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Yes, use sheet</button>
              <button onClick={() => setConfirmAll(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">No</button>
            </>
          ) : (
            <>
              <button onClick={onClose} disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                Close
              </button>
              {open.length > 1 && (
                <button
                  onClick={() => setConfirmAll(true)}
                  disabled={busy}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
                >
                  {busyId === "all" ? "Updating…" : `Use sheet for all ${open.length}`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
