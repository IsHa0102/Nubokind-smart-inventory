import { useMemo, useRef, useState } from "react"
import { fetchChallanContext } from "../api/inventoryApi"
import { readPdfItems } from "../lib/challan/pdfText"
import { parseChallanItems, guessDestination, PLATFORM_LABEL } from "../lib/challan/parseChallan"
import { matchRow, aliasesToLearn } from "../lib/challan/matchSku"
import { SHIPMENT_PRODUCTS, lineLabel } from "../lib/shipmentConfig"

const BADGE = {
  exact:   ["Matched",       "bg-emerald-100 text-emerald-700"],
  learned: ["Matched before", "bg-emerald-100 text-emerald-700"],
  guess:   ["Check",         "bg-amber-100 text-amber-700"],
  partial: ["Pick colour",   "bg-rose-100 text-rose-700"],
  none:    ["Pick product",  "bg-rose-100 text-rose-700"],
}

const productOf = (key) => SHIPMENT_PRODUCTS.find((p) => p.key === key)
const needsVariant = (r) => !!productOf(r.sku_key)?.variants && !r.variant_key
const rowReady = (r) => !r.include || (r.sku_key && !needsVariant(r) && Number.isInteger(r.quantity) && r.quantity > 0)

/**
 * Upload a delivery challan PDF (Amazon FBA, Blinkit R.O., website DC), review
 * how each line maps to a SKU, then fill the consignment form with it. Nothing
 * is saved here — the form's own confirm step still shows the stock impact.
 *
 * Props: destinations, existing (consignments, for duplicate warnings), onApply(draft)
 */
export default function ChallanImport({ destinations, existing = [], onApply }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [draft, setDraft] = useState(null) // { file, platform, reference, challanDate, boxes, hints, destination }
  const [rows, setRows] = useState([])

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setBusy(true); setError(""); setDraft(null); setRows([])
    try {
      if (!/\.pdf$/i.test(file.name)) throw new Error("Please upload the challan as a PDF.")
      const [items, ctx] = await Promise.all([readPdfItems(file), fetchChallanContext()])
      const parsed = parseChallanItems(items)
      if (parsed.error) throw new Error(parsed.error)
      setDraft({
        fileName: file.name,
        platform: parsed.platform,
        reference: parsed.reference,
        challanDate: parsed.challanDate,
        boxes: parsed.boxes,
        hints: parsed.hints,
        destination: guessDestination(parsed.platform, parsed.text, destinations)?.name ?? "",
      })
      setRows(parsed.rows.map((r, i) => {
        const m = matchRow(r, { platform: parsed.platform, ...ctx })
        return { ...r, id: i, include: true, sku_key: m.sku_key, variant_key: m.variant_key, match: m }
      }))
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  const update = (id, patch) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const duplicate = useMemo(() => {
    if (!draft?.reference) return null
    const ref = draft.reference.toLowerCase()
    return existing.find((s) => s.status !== "cancelled" && String(s.reference || "").toLowerCase() === ref)
  }, [draft, existing])

  const included = rows.filter((r) => r.include)
  const blocking = rows.filter((r) => !rowReady(r))
  const totalUnits = included.reduce((s, r) => s + (Number(r.quantity) || 0), 0)

  const apply = () => {
    // Merge challan lines that map to the same SKU (Amazon lists one ASIN per row).
    const merged = {}
    for (const r of included) {
      const k = `${r.sku_key}|${r.variant_key || ""}`
      merged[k] = merged[k]
        ? { ...merged[k], quantity: merged[k].quantity + Number(r.quantity) }
        : { sku_key: r.sku_key, variant_key: r.variant_key || null, quantity: Number(r.quantity), label: lineLabel(r.sku_key, r.variant_key) }
    }

    const platformLabel = PLATFORM_LABEL[draft.platform] || "Challan"
    onApply({
      destination: draft.destination,
      dispatch_date: draft.platform === "blinkit" ? "" : draft.challanDate,
      reference: draft.reference,
      corrugation_boxes: draft.boxes,
      notes: `From ${platformLabel} challan ${draft.reference || draft.fileName}`,
      lines: Object.values(merged),
      source_document: `${platformLabel}: ${draft.fileName}`,
      // Saved by the form only once the consignment itself is saved.
      aliases: aliasesToLearn(draft.platform, included),
      summary: `${included.length} challan line${included.length !== 1 ? "s" : ""} → ${Object.keys(merged).length} SKU${Object.keys(merged).length !== 1 ? "s" : ""}, ${totalUnits} units`,
    })
    setDraft(null)
    setRows([])
  }

  const selectCls = "rounded border border-slate-300 px-1.5 py-1 text-xs focus:border-indigo-400 focus:outline-none"

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-600 mr-1">Delivery challan</span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Reading PDF…" : "📄 Upload challan PDF"}
        </button>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={onFile} className="hidden" />
        <span className="text-[11px] text-slate-500">Amazon FBA, Blinkit R.O. or website DC — you check every line before it's used.</span>
      </div>

      {error && <p className="text-xs text-rose-600">{error}</p>}

      {draft && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
            <div><p className="text-slate-400">Platform</p><p className="font-semibold text-slate-800">{PLATFORM_LABEL[draft.platform]}</p></div>
            <div><p className="text-slate-400">Reference</p><p className="font-mono font-semibold text-slate-800">{draft.reference || "—"}</p></div>
            <div><p className="text-slate-400">Challan date</p><p className="font-semibold text-slate-800">{draft.challanDate || "—"}</p></div>
            <div><p className="text-slate-400">Boxes</p><p className="font-semibold text-slate-800">{draft.boxes ?? "—"}</p></div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500">Destination</span>
            <select value={draft.destination} onChange={(e) => setDraft({ ...draft, destination: e.target.value })} className={selectCls}>
              <option value="">Select…</option>
              {destinations.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
          </div>

          {draft.hints.map((h) => <p key={h} className="text-[11px] text-slate-500">ℹ {h}</p>)}
          {duplicate && (
            <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
              ⚠ Reference {draft.reference} is already on Consignment #{duplicate.id} ({duplicate.status}). Check it isn't a double entry.
            </p>
          )}

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50">
                <tr className="text-left text-slate-600">
                  <th className="px-2 py-2"></th>
                  <th className="px-2 py-2 font-semibold">On the challan</th>
                  <th className="px-2 py-2 font-semibold text-right">Qty</th>
                  <th className="px-2 py-2 font-semibold">Our SKU</th>
                  <th className="px-2 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const product = productOf(r.sku_key)
                  const [badge, badgeCls] = !r.include ? ["Skipped", "bg-slate-100 text-slate-500"]
                    : rowReady(r) && (r.match.confidence === "partial" || r.match.confidence === "none")
                      ? ["Picked", "bg-emerald-100 text-emerald-700"]
                      : BADGE[r.match.confidence]
                  return (
                    <tr key={r.id} className={`border-t border-slate-100 align-top ${r.include ? "" : "opacity-50"}`}>
                      <td className="px-2 py-2">
                        <input type="checkbox" checked={r.include} onChange={(e) => update(r.id, { include: e.target.checked })} title="Include this line" />
                      </td>
                      <td className="px-2 py-2 max-w-[260px]">
                        <p className="line-clamp-2 text-slate-700" title={r.description}>{r.description}</p>
                        {r.itemCode && <p className="font-mono text-[10px] text-slate-400">Item {r.itemCode}</p>}
                        <p className="text-[10px] text-slate-400">{r.match.reason}</p>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input
                          type="number" min="1" value={r.quantity}
                          onChange={(e) => update(r.id, { quantity: Number(e.target.value) })}
                          className="w-16 rounded border border-slate-300 px-1.5 py-1 text-right tabular-nums"
                        />
                      </td>
                      <td className="px-2 py-2 space-y-1">
                        <select
                          value={r.sku_key || ""}
                          onChange={(e) => update(r.id, { sku_key: e.target.value || null, variant_key: null })}
                          className={`${selectCls} w-full`}
                        >
                          <option value="">Select product…</option>
                          {SHIPMENT_PRODUCTS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                        </select>
                        {product?.variants && (
                          <select
                            value={r.variant_key || ""}
                            onChange={(e) => update(r.id, { variant_key: e.target.value || null })}
                            className={`${selectCls} w-full ${needsVariant(r) && r.include ? "border-rose-400" : ""}`}
                          >
                            <option value="">Select colour…</option>
                            {product.variants
                              .filter((v) => !r.match.candidates.length || r.match.sku_key !== r.sku_key || r.match.candidates.includes(v.key) || v.key === r.variant_key)
                              .map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeCls}`}>{badge}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={apply}
              disabled={blocking.length > 0 || included.length === 0}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              Use {included.length} line{included.length !== 1 ? "s" : ""} ({totalUnits} units)
            </button>
            <button type="button" onClick={() => { setDraft(null); setRows([]) }} className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50">
              Discard
            </button>
            {blocking.length > 0 && (
              <span className="text-[11px] text-rose-600">
                {blocking.length} line{blocking.length !== 1 ? "s" : ""} still need a product or colour — pick one or untick the line.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
