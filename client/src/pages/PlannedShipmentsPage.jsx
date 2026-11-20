import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import {
  fetchPlannedShipments,
  updatePlannedShipment,
  updatePlannedShipmentStatus,
  deletePlannedShipment,
  fetchDestinations,
  fetchProducts,
  saveConsignment,
  cancelConsignment,
  runDueDispatches,
  saveChallanAliases,
} from "../api/inventoryApi"
import { SHIPMENT_PRODUCTS, buildAllDeductions, lineLabel, makeStockLookup } from "../lib/shipmentConfig"
import { downloadConsignmentTemplate } from "../lib/consignmentTemplate"
import TemplateButtons from "../components/ConsignmentTemplateButtons"
import ChallanImport from "../components/ChallanImport"
import ComponentMappingWarning from "../components/ComponentMappingWarning"

// Lifecycle: stock is deducted the moment a consignment is logged.
// scheduled (dispatch date still ahead) → dispatched (status flips on its date,
// no stock moves then) → cancelled (stock returned). See sql/006.
// pending / approved / rejected are legacy "plans": still shown and
// dispatchable, but new plans can no longer be created.
const statusStyles = {
  pending:    "bg-amber-100 text-amber-700",
  approved:   "bg-emerald-100 text-emerald-700",
  rejected:   "bg-rose-100 text-rose-700",
  scheduled:  "bg-sky-100 text-sky-700",
  dispatched: "bg-indigo-100 text-indigo-700",
  cancelled:  "bg-slate-200 text-slate-600",
}

const statusLabel = {
  pending: "Pending", approved: "Approved", rejected: "Rejected",
  scheduled: "Scheduled", dispatched: "Dispatched", cancelled: "Cancelled",
}

// Local (India) date, not UTC: toISOString() would give yesterday before 5:30 am.
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function formatDate(val) {
  return new Date(val).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function formatPlainDate(val) {
  if (!val) return null
  // "YYYY-MM-DD" — parse as a local date to avoid a UTC shift
  const [y, m, d] = val.split("-")
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

// Components a set of lines (+ corrugation) takes out of stock.
function componentsFor(lines, corrugation) {
  const list = buildAllDeductions(
    lines.map((l) => ({ productKey: l.sku_key, variantKey: l.variant_key, qty: l.quantity }))
  )
  const corr = Number(corrugation) || 0
  if (corr > 0) list.push({ name: "Corrugation Box", quantity: corr })
  return list
}

const linesOf = (s) =>
  (s?.warehouse_planned_shipment_lines || []).map((l) => ({
    sku_key: l.sku_key, variant_key: l.variant_key, quantity: l.quantity, label: l.label,
  }))

// ── Feasibility Check ──────────────────────────────────────────────────────
function FeasibilityCheck({ lines, corrugation = 0 }) {
  const [stockByName, setStockByName] = useState(null)
  const hasLines = lines && lines.length > 0

  useEffect(() => {
    if (!hasLines) return
    let alive = true
    fetchProducts().then((products) => {
      if (!alive) return
      setStockByName(() => makeStockLookup(products))
    })
    return () => { alive = false }
  }, [hasLines, lines])

  const result = useMemo(() => {
    if (!hasLines || !stockByName) return null
    return componentsFor(lines, corrugation).map((r) => ({
      ...r,
      stock: stockByName(r.name),
      ok: (stockByName(r.name)) >= r.quantity,
    }))
  }, [hasLines, lines, corrugation, stockByName])

  if (!hasLines) return <p className="text-xs text-slate-400">No components to check.</p>
  if (!result) return <p className="text-xs text-slate-400">Checking stock...</p>

  const shortages = result.filter((r) => !r.ok)
  const allOk = shortages.length === 0

  return (
    <div className="space-y-3">
      <div className={`rounded-lg px-4 py-3 text-sm font-medium ${allOk ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
        {allOk ? "Stock sufficient — can ship" : `${shortages.length} item${shortages.length > 1 ? "s" : ""} short — logging still deducts everything; short items go into minus`}
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Component</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-600">Need</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-600">Have</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-600">Status</th>
            </tr>
          </thead>
          <tbody>
            {result.map((r, i) => (
              <tr key={i} className={`border-t border-slate-100 ${r.ok ? "" : "bg-rose-50/40"}`}>
                <td className="px-3 py-1.5 text-slate-800 font-medium">{r.name}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{r.quantity}</td>
                <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${r.ok ? "text-emerald-600" : "text-rose-600"}`}>{r.stock}</td>
                <td className="px-3 py-1.5 text-center">
                  {r.ok
                    ? <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">OK</span>
                    : <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">SHORT {r.quantity - r.stock}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Stock impact preview (dispatch mode) ───────────────────────────────────
// New consignment: everything listed is deducted.
// Editing a logged one: only the difference against what it already holds.
function StockImpact({ lines, corrugation, original, scheduledFor }) {
  const rows = useMemo(() => {
    const next = Object.fromEntries(componentsFor(lines, corrugation).map((c) => [c.name, c.quantity]))
    const prev = original
      ? Object.fromEntries(componentsFor(original.lines, original.corrugation).map((c) => [c.name, c.quantity]))
      : {}
    const names = [...new Set([...Object.keys(prev), ...Object.keys(next)])].sort()
    return names
      .map((name) => ({ name, delta: (next[name] || 0) - (prev[name] || 0) }))
      .filter((r) => r.delta !== 0)
  }, [lines, corrugation, original])

  if (lines.length === 0) return null

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
      <p className="text-sm font-semibold text-amber-800">
        {original
          ? "Saving will change stock by:"
          : scheduledFor
            ? `Logging deducts from inventory now (ships ${formatPlainDate(scheduledFor)}):`
            : "Dispatching will deduct from inventory:"}
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-amber-700">No stock change — only the details are updated.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-amber-200 bg-white divide-y divide-amber-100">
          {rows.map((r) => (
            <div key={r.name} className="flex items-center justify-between px-3 py-1.5 text-sm">
              <span className="text-slate-700">{r.name}</span>
              <span className={`font-semibold tabular-nums ${r.delta > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                {r.delta > 0 ? `− ${r.delta}` : `+ ${-r.delta} back`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Shipment Form (plan / dispatch, create + edit) ─────────────────────────
// mode "plan":     planned order, no stock change.
// mode "dispatch": consignment; saving deducts stock now (or the delta when
//                  editing), whatever the date. A future date only means it
//                  shows as Scheduled until then. `original` = what it already
//                  holds (for the delta preview); `alreadySent` = dispatched,
//                  so its date can't move into the future.
function ShipmentForm({ mode = "plan", destinations, existing = [], initialValues = {}, original = null, alreadySent = false, onSubmit, onCancel, submitLabel }) {
  const isDispatch = mode === "dispatch"
  const [destination, setDestination] = useState(initialValues.destination ?? "")
  const [plannedDate, setPlannedDate] = useState(initialValues.planned_date ?? "")
  const [dispatchDate, setDispatchDate] = useState(initialValues.dispatch_date ?? today())
  const [reference, setReference] = useState(initialValues.reference ?? "")
  const [corrugation, setCorrugation] = useState(initialValues.corrugation_boxes ?? "")
  const [notes, setNotes] = useState(initialValues.notes ?? "")
  const [lines, setLines] = useState(initialValues.lines ?? [])
  const [productKey, setProductKey] = useState("")
  const [variantKey, setVariantKey] = useState("")
  const [qty, setQty] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [loadedNote, setLoadedNote] = useState("")
  const [sourceDocument, setSourceDocument] = useState(null)
  const [pendingAliases, setPendingAliases] = useState([])

  const selectedProduct = SHIPMENT_PRODUCTS.find((p) => p.key === productKey)
  const isFuture = isDispatch && !!dispatchDate && dispatchDate > today()

  const addLine = () => {
    if (!productKey || !qty || Number(qty) <= 0) return
    if (selectedProduct?.variants && !variantKey) return
    const v = variantKey || null
    setLines((prev) => {
      const i = prev.findIndex((l) => l.sku_key === productKey && (l.variant_key || null) === v)
      if (i >= 0) return prev.map((l, idx) => (idx === i ? { ...l, quantity: l.quantity + Number(qty) } : l))
      return [...prev, { sku_key: productKey, variant_key: v, quantity: Number(qty), label: lineLabel(productKey, v) }]
    })
    setProductKey("")
    setVariantKey("")
    setQty("")
  }

  const setLineQty = (i, val) => {
    const n = Number(val)
    if (!val || n <= 0 || !Number.isInteger(n)) return
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, quantity: n } : l)))
  }

  const removeLine = (i) => setLines((prev) => prev.filter((_, idx) => idx !== i))

  const onTemplateLoaded = (t) => {
    setDestination(t.destination)
    if (t.dispatch_date) { setDispatchDate(t.dispatch_date); setPlannedDate(t.dispatch_date) }
    setReference(t.reference)
    setNotes(t.notes)
    if (t.corrugation_boxes !== null) setCorrugation(String(t.corrugation_boxes))
    setLines(t.lines)
    setError("")
    const units = t.lines.reduce((s, l) => s + l.quantity, 0)
    setLoadedNote(`Loaded ${t.lines.length} SKU line${t.lines.length !== 1 ? "s" : ""} (${units} units) from the template.`)
  }

  const onChallanApplied = (c) => {
    if (c.destination) setDestination(c.destination)
    if (c.dispatch_date) setDispatchDate(c.dispatch_date)
    setReference(c.reference || "")
    setNotes(c.notes || "")
    if (c.corrugation_boxes !== null && c.corrugation_boxes !== undefined) setCorrugation(String(c.corrugation_boxes))
    setLines(c.lines)
    setSourceDocument(c.source_document)
    setPendingAliases(c.aliases || [])
    setError("")
    setLoadedNote(`Filled from the challan: ${c.summary}. Check the details below, then confirm.`)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!destination) { setError("Please select a destination."); return }
    if (lines.length === 0) { setError("Add at least one SKU line."); return }
    if (isDispatch) {
      if (!dispatchDate) { setError("Please enter the dispatch date."); return }
      if (alreadySent && isFuture) { setError("This consignment is already dispatched — its date can't be in the future."); return }
      const c = Number(corrugation)
      if (corrugation === "" || !Number.isInteger(c) || c < 0) { setError("Enter the corrugation boxes used (0 if none)."); return }
    }
    setSubmitting(true)
    setError("")
    try {
      await onSubmit({
        destination,
        planned_date: plannedDate || null,
        dispatch_date: dispatchDate,
        reference,
        corrugation_boxes: Number(corrugation) || 0,
        notes,
        lines,
        source_document: sourceDocument,
      })
      // Remember hand-made challan matches only now the consignment is saved.
      // Best effort: the consignment is already in.
      if (pendingAliases.length) {
        saveChallanAliases(pendingAliases).catch((err) => console.warn("Could not save challan matches:", err.message))
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
  const totalUnits = lines.reduce((s, l) => s + l.quantity, 0)

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isDispatch && !original && (
        <ChallanImport destinations={destinations} existing={existing} onApply={onChallanApplied} />
      )}
      <TemplateButtons
        destinations={destinations}
        onLoaded={onTemplateLoaded}
        prefill={lines.length ? { destination, dispatch_date: dispatchDate, reference, notes, corrugation_boxes: corrugation, lines } : null}
      />
      {loadedNote && <p className="text-xs font-medium text-emerald-700">✓ {loadedNote}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Destination *</label>
          <select value={destination} onChange={(e) => setDestination(e.target.value)} className={inputCls}>
            <option value="">Select destination…</option>
            {destinations.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
        </div>

        {isDispatch ? (
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Dispatch Date *</label>
            <input
              type="date"
              value={dispatchDate}
              max={alreadySent ? today() : undefined}
              onChange={(e) => setDispatchDate(e.target.value)}
              className={inputCls}
            />
            {isFuture && !alreadySent && (
              <p className="text-[11px] font-medium text-sky-700">
                Future date — stock is deducted now; it shows as Scheduled and is marked dispatched on that day.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Planned Ship Date</label>
            <input type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} className={inputCls} />
          </div>
        )}

        {isDispatch && (
          <>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Reference / AWB</label>
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Corrugation Boxes Used *</label>
              <input type="number" min="0" value={corrugation} onChange={(e) => setCorrugation(e.target.value)} placeholder="e.g. 15" className={inputCls} />
            </div>
          </>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-slate-600">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Any context for this consignment…"
          className={`${inputCls} resize-none`}
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-600">SKU Lines</label>
        <div className="flex flex-wrap gap-2">
          <select
            value={productKey}
            onChange={(e) => { setProductKey(e.target.value); setVariantKey("") }}
            className="flex-1 min-w-[160px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
          >
            <option value="">Select product…</option>
            {SHIPMENT_PRODUCTS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>

          {selectedProduct?.variants && (
            <select
              value={variantKey}
              onChange={(e) => setVariantKey(e.target.value)}
              className="flex-1 min-w-[160px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            >
              <option value="">Select variant…</option>
              {selectedProduct.variants.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
            </select>
          )}

          <input
            type="number"
            min="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLine() } }}
            placeholder="Qty"
            className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
          />

          <button
            type="button"
            onClick={addLine}
            disabled={!productKey || !qty || Number(qty) <= 0 || (selectedProduct?.variants && !variantKey)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            Add
          </button>
        </div>

        {lines.length > 0 && (
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">SKU</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-600">Qty</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={`${l.sku_key}|${l.variant_key}`} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 text-slate-800">{l.label}</td>
                    <td className="px-3 py-1.5 text-right">
                      <input
                        type="number"
                        min="1"
                        defaultValue={l.quantity}
                        key={l.quantity}
                        onBlur={(e) => setLineQty(i, e.target.value)}
                        className="w-20 rounded border border-slate-300 px-2 py-1 text-right tabular-nums"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button type="button" onClick={() => removeLine(i)} className="text-slate-400 hover:text-rose-500 text-xs">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50">
                  <td className="px-3 py-1.5 font-semibold text-slate-600">{lines.length} SKU{lines.length !== 1 ? "s" : ""}</td>
                  <td className="px-3 py-1.5 text-right font-bold tabular-nums text-slate-900">{totalUnits}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {isDispatch && (
        <StockImpact lines={lines} corrugation={corrugation} original={original} scheduledFor={isFuture ? dispatchDate : null} />
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className={`rounded-lg px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-colors ${
            isFuture ? "bg-sky-600 hover:bg-sky-700" : isDispatch ? "bg-rose-600 hover:bg-rose-700" : "bg-indigo-600 hover:bg-indigo-700"}`}
        >
          {submitting ? "Saving…" : isFuture && !original ? `Deduct Stock · Ships ${formatPlainDate(dispatchDate)}` : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── Detail Panel ────────────────────────────────────────────────────────────
function DetailPanel({ shipment, destinations, onStatusChange, onRemoved, onEdit, onDispatch, onCancelled }) {
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(null) // "delete" | "cancel"
  const [error, setError] = useState("")

  // Memoised: FeasibilityCheck re-fetches whenever this reference changes.
  const lines = useMemo(() => linesOf(shipment), [shipment])
  const isDispatched = shipment.status === "dispatched"
  const isCancelled = shipment.status === "cancelled"
  const isScheduled = shipment.status === "scheduled"
  const isPlan = !isDispatched && !isCancelled && !isScheduled
  const components = useMemo(
    () => componentsFor(lines, shipment.corrugation_boxes),
    [lines, shipment.corrugation_boxes]
  )

  const run = async (fn) => {
    setBusy(true)
    setError("")
    try { await fn() } catch (e) { setError(e.message) } finally { setBusy(false); setConfirm(null) }
  }

  const handleStatus = (status) => run(async () => {
    await updatePlannedShipmentStatus(shipment.id, status)
    onStatusChange(shipment.id, status)
  })

  const handleDelete = () => run(async () => {
    await deletePlannedShipment(shipment.id)
    onRemoved(shipment.id)
  })

  const handleCancel = () => run(async () => {
    await cancelConsignment(shipment.id)
    await onCancelled()
  })

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400">
            {isPlan ? "Plan" : "Consignment"} #{shipment.id} · created {formatDate(shipment.created_at)}
          </p>
          <h3 className="text-lg font-bold text-slate-900">{shipment.destination}</h3>
          {isPlan && shipment.planned_date && (
            <p className="mt-0.5 text-sm font-medium text-indigo-600">Ship by {formatPlainDate(shipment.planned_date)}</p>
          )}
          {isScheduled && shipment.dispatch_date && (
            <p className="mt-0.5 text-sm font-medium text-sky-700">
              Ships {formatPlainDate(shipment.dispatch_date)} — stock already deducted; marked dispatched that day
            </p>
          )}
          {(isDispatched || isCancelled) && shipment.dispatch_date && (
            <p className="mt-0.5 text-sm font-medium text-indigo-600">Dispatched {formatPlainDate(shipment.dispatch_date)}</p>
          )}
          {shipment.reference && <p className="mt-0.5 text-xs text-slate-500">Ref: <span className="font-mono">{shipment.reference}</span></p>}
          {shipment.source_document && <p className="mt-0.5 text-xs text-slate-500">📄 {shipment.source_document}</p>}
          {shipment.notes && <p className="mt-1 text-sm text-slate-500">{shipment.notes}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[shipment.status] || ""}`}>
            {statusLabel[shipment.status] || shipment.status}
          </span>
          <button
            onClick={() => downloadConsignmentTemplate(destinations, {
              id: shipment.id, destination: shipment.destination,
              dispatch_date: shipment.dispatch_date || shipment.planned_date || "",
              reference: shipment.reference, notes: shipment.notes,
              corrugation_boxes: shipment.corrugation_boxes, lines,
            })}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            ⬇ Excel
          </button>
          {!isCancelled && (
            <button onClick={onEdit} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              Edit
            </button>
          )}
        </div>
      </div>

      {isCancelled && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Cancelled — any stock it took was returned. The History entries stay for the record.
        </p>
      )}

      {isScheduled && shipment.dispatch_error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <p className="font-semibold">Stock for this consignment couldn't be deducted</p>
          <p className="mt-0.5">{shipment.dispatch_error}</p>
          <p className="mt-1 text-rose-600">Fix the stock (or the quantities), then open Edit and save it again.</p>
        </div>
      )}

      {/* SKU lines */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">SKU Lines</p>
        {lines.length === 0
          ? <p className="text-sm text-slate-400">No lines recorded.</p>
          : (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">SKU</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-800">{l.label}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900">{l.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {/* Plan: feasibility. Scheduled / dispatched: what it took out of stock. */}
      {isPlan ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stock Feasibility Check</p>
          <FeasibilityCheck lines={lines} />
          <p className="text-[11px] text-slate-400">Corrugation boxes are entered when you dispatch.</p>
        </div>
      ) : (isDispatched || isScheduled) && (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Deducted from inventory</p>
          <div className="overflow-hidden rounded-lg border border-slate-200 divide-y divide-slate-100">
            {components.map((c) => (
              <div key={c.name} className="flex items-center justify-between px-3 py-1.5 text-sm">
                <span className="text-slate-700">{c.name}</span>
                <span className="font-semibold tabular-nums text-rose-600">− {c.quantity}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-400">Each deduction is in History, tagged Consignment #{shipment.id}.</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {shipment.status === "pending" && (
          <>
            <button onClick={() => handleStatus("approved")} disabled={busy}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              Approve
            </button>
            <button onClick={() => handleStatus("rejected")} disabled={busy}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
              Reject
            </button>
          </>
        )}
        {(shipment.status === "pending" || shipment.status === "approved") && (
          <button onClick={onDispatch} disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
            Mark as Dispatched →
          </button>
        )}
        {isScheduled && (
          <button onClick={onDispatch} disabled={busy}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
            Dispatch now →
          </button>
        )}
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="border-t border-slate-100 pt-3">
        {confirm === "delete" && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-600">Delete this plan? (No stock is affected.)</span>
            <button onClick={handleDelete} disabled={busy} className="rounded px-2.5 py-1 text-xs font-semibold bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-50">
              {busy ? "…" : "Yes, delete"}
            </button>
            <button onClick={() => setConfirm(null)} className="rounded px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100">No</button>
          </div>
        )}
        {confirm === "cancel" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-600">
              {isScheduled
                ? `Cancel consignment #${shipment.id} before it ships? All its units go back into stock.`
                : `Cancel consignment #${shipment.id}? All its units go back into stock.`}
            </span>
            <button onClick={handleCancel} disabled={busy} className="rounded px-2.5 py-1 text-xs font-semibold bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-50">
              {busy ? "…" : "Yes, cancel it"}
            </button>
            <button onClick={() => setConfirm(null)} className="rounded px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100">No</button>
          </div>
        )}
        {!confirm && isPlan && (
          <button onClick={() => setConfirm("delete")} className="text-xs text-rose-500 hover:text-rose-700">Delete plan</button>
        )}
        {!confirm && isDispatched && (
          <button onClick={() => setConfirm("cancel")} className="text-xs text-rose-500 hover:text-rose-700">Cancel consignment (return stock)</button>
        )}
        {!confirm && isScheduled && (
          <button onClick={() => setConfirm("cancel")} className="text-xs text-rose-500 hover:text-rose-700">Cancel consignment (return stock)</button>
        )}
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function PlannedShipmentsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [shipments, setShipments] = useState([])
  const [destinations, setDestinations] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(() => Number(searchParams.get("id")) || null)
  // null | "new-consignment" | "edit" | "dispatch"
  const [view, setView] = useState(null)
  const [flash, setFlash] = useState("")

  useEffect(() => {
    // Dispatch anything due today before listing, so statuses are current.
    runDueDispatches()
      .then((due) => {
        // The run is cached for a few minutes; announce its result only once.
        if (due.announced) return
        due.announced = true
        const parts = []
        if (due.dispatched?.length) parts.push(`✓ Auto-dispatched today: ${due.dispatched.map((d) => `#${d.id}`).join(", ")}.`)
        if (due.failed?.length) parts.push(`⚠ Couldn't auto-dispatch ${due.failed.map((d) => `#${d.id}`).join(", ")} — open it to see why.`)
        if (parts.length) setFlash(parts.join(" "))
      })
      .then(() => Promise.all([fetchPlannedShipments(), fetchDestinations()]))
      .then(([s, d]) => {
        setShipments(s)
        setDestinations(d)
      })
      .catch((e) => setFlash(`⚠ Couldn't load consignments: ${e.message}`))
      .finally(() => setLoading(false))
  }, [])

  const selected = shipments.find((s) => s.id === selectedId)

  const select = (id) => {
    setSelectedId(id)
    setView(null)
    setFlash("")
    setSearchParams(id ? { id: String(id) } : {}, { replace: true })
  }

  const refresh = async () => {
    const fresh = await fetchPlannedShipments()
    setShipments(fresh)
    return fresh
  }


  const handleSaveConsignment = (id) => async (values) => {
    const res = await saveConsignment({ id, ...values })
    await refresh()
    select(res.id)
    // Short items are still deducted (stock goes into minus, sql/007).
    const short = res.short?.length
      ? ` ⚠ Short: ${res.short.map((s) => `${s.name} ${s.stock}`).join(", ")} — shown in minus on Inventory until restocked or recounted.`
      : ""
    setFlash((
      res.status === "scheduled"
        ? (res.edited
          ? `✓ Consignment #${res.id} updated — ${res.entries_written} stock correction${res.entries_written !== 1 ? "s" : ""} logged. Ships ${formatPlainDate(res.dispatch_date)}.`
          : `✓ Consignment #${res.id} logged — ${res.entries_written} item${res.entries_written !== 1 ? "s" : ""} deducted from stock and logged in History. Ships ${formatPlainDate(res.dispatch_date)}.`)
        : res.edited
          ? `✓ Consignment #${res.id} updated — ${res.entries_written} stock correction${res.entries_written !== 1 ? "s" : ""} logged.`
          : `✓ Consignment #${res.id} dispatched — ${res.entries_written} item${res.entries_written !== 1 ? "s" : ""} deducted from stock and logged in History.`
    ) + short)
  }

  const handleEditPlan = async ({ destination, planned_date, notes, lines }) => {
    await updatePlannedShipment(selectedId, { destination, planned_date, notes, lines })
    await refresh()
    setView(null)
  }

  const byDispatchDate = (a, b) => String(a.dispatch_date).localeCompare(String(b.dispatch_date)) || a.id - b.id
  const groups = [
    ["Scheduled", shipments.filter((s) => s.status === "scheduled").sort(byDispatchDate)],
    ["Dispatched", shipments.filter((s) => s.status === "dispatched")],
    ["Older plans", shipments.filter((s) => s.status === "pending" || s.status === "approved")],
    ["Rejected", shipments.filter((s) => s.status === "rejected")],
    ["Cancelled", shipments.filter((s) => s.status === "cancelled")],
  ]

  const renderCard = (s) => {
    const lines = s.warehouse_planned_shipment_lines || []
    const units = lines.reduce((sum, l) => sum + (l.quantity || 0), 0)
    const dateLine = s.status === "scheduled"
      ? `${s.dispatch_error ? "⚠ Overdue — " : "Ships "}${formatPlainDate(s.dispatch_date)}`
      : s.status === "dispatched" || s.status === "cancelled"
        ? (s.dispatch_date ? `Dispatched ${formatPlainDate(s.dispatch_date)}` : formatDate(s.created_at))
        : (s.planned_date ? `Ship by ${formatPlainDate(s.planned_date)}` : formatDate(s.created_at))
    return (
      <button
        key={s.id}
        onClick={() => select(s.id)}
        className={`w-full text-left rounded-xl border p-3 transition-all ${
          selectedId === s.id ? "border-indigo-400 bg-indigo-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">
              <span className="text-slate-400 font-normal">#{s.id}</span> {s.destination}
            </p>
            <p className={`text-xs font-medium mt-0.5 ${s.dispatch_error && s.status === "scheduled" ? "text-rose-600" : "text-indigo-500"}`}>{dateLine}</p>
            <p className="text-xs text-slate-400 mt-0.5">{lines.length} SKU{lines.length !== 1 ? "s" : ""} · {units} units</p>
          </div>
          <span className={`shrink-0 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusStyles[s.status] || ""}`}>
            {statusLabel[s.status] || s.status}
          </span>
        </div>
      </button>
    )
  }

  const selectedValues = selected ? {
    destination: selected.destination,
    planned_date: selected.planned_date ?? "",
    dispatch_date: selected.dispatch_date ?? today(),
    reference: selected.reference ?? "",
    corrugation_boxes: selected.corrugation_boxes ?? "",
    notes: selected.notes ?? "",
    lines: linesOf(selected),
  } : {}

  const renderRight = () => {
    if (view === "new-consignment") {
      return (
        <div className="space-y-4">
          <h3 className="text-base font-bold text-slate-900">
            Log a Consignment <span className="text-xs font-normal text-slate-400">— stock is deducted as soon as you log it</span>
          </h3>
          <ShipmentForm
            mode="dispatch"
            destinations={destinations}
            existing={shipments}
            onSubmit={handleSaveConsignment(null)}
            onCancel={() => setView(null)}
            submitLabel="Confirm Dispatch & Deduct Stock"
          />
        </div>
      )
    }
    if (!selected) {
      return (
        <div className="flex h-48 items-center justify-center text-sm text-slate-400 text-center px-6">
          Select a consignment, or log a new one. Upload a delivery challan PDF or the Excel template to fill the form in one go.
        </div>
      )
    }
    if (view === "dispatch") {
      return (
        <div className="space-y-4">
          <h3 className="text-base font-bold text-slate-900">
            Dispatch {selected.status === "scheduled" ? "Consignment" : "Plan"} #{selected.id} now — {selected.destination}
          </h3>
          <ShipmentForm
            key={`dispatch-${selected.id}`}
            mode="dispatch"
            destinations={destinations}
            existing={shipments}
            initialValues={{ ...selectedValues, dispatch_date: today() }}
            original={selected.status === "scheduled" ? { lines: selectedValues.lines, corrugation: selected.corrugation_boxes } : null}
            onSubmit={handleSaveConsignment(selected.id)}
            onCancel={() => setView(null)}
            submitLabel="Confirm Dispatch & Deduct Stock"
          />
        </div>
      )
    }
    if (view === "edit") {
      const dispatched = selected.status === "dispatched"
      const scheduled = selected.status === "scheduled"
      return (
        <div className="space-y-4">
          <h3 className="text-base font-bold text-slate-900">
            Edit {dispatched || scheduled ? "Consignment" : "Plan"} #{selected.id} — {selected.destination}
          </h3>
          <ShipmentForm
            key={`edit-${selected.id}`}
            mode={dispatched || scheduled ? "dispatch" : "plan"}
            destinations={destinations}
            existing={shipments}
            initialValues={selectedValues}
            original={dispatched || scheduled ? { lines: selectedValues.lines, corrugation: selected.corrugation_boxes } : null}
            alreadySent={dispatched}
            onSubmit={dispatched || scheduled ? handleSaveConsignment(selected.id) : handleEditPlan}
            onCancel={() => setView(null)}
            submitLabel={dispatched || scheduled ? "Save & Correct Stock" : "Save Changes"}
          />
        </div>
      )
    }
    return (
      <>
        {flash && <p className={`mb-4 rounded-lg border px-3 py-2 text-sm font-medium ${flash.includes("⚠") ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{flash}</p>}
        <DetailPanel
          key={selected.id}
          shipment={selected}
          destinations={destinations}
          onStatusChange={(id, status) => setShipments((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)))}
          onRemoved={(id) => { setShipments((prev) => prev.filter((s) => s.id !== id)); select(null) }}
          onEdit={() => { setView("edit"); setFlash("") }}
          onDispatch={() => { setView("dispatch"); setFlash("") }}
          onCancelled={async () => {
            await refresh()
            setFlash(`✓ Consignment #${selected.id} cancelled — stock returned.`)
          }}
        />
      </>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Consignments</h2>
        <p className="text-sm text-slate-500">
          Every consignment deducts its components from stock and logs them in History as soon as it is logged. Future-dated ones show as Scheduled until their dispatch date.
        </p>
      </div>

      <ComponentMappingWarning />

      {flash && !selected && view === null && (
        <p className={`rounded-lg border px-3 py-2 text-sm font-medium ${flash.includes("⚠") ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{flash}</p>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Left: list */}
        <div className="w-full lg:w-72 shrink-0 space-y-3">
          <button
            onClick={() => { setView("new-consignment"); setSelectedId(null); setFlash("") }}
            className="w-full rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 transition-colors"
          >
            + Log Consignment
          </button>

          {loading && <p className="text-sm text-slate-400 px-1">Loading…</p>}
          {!loading && shipments.length === 0 && <p className="text-sm text-slate-400 px-1">Nothing here yet.</p>}

          {groups.map(([title, list]) => list.length > 0 && (
            <div key={title} className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 px-1">{title}</p>
              {list.map(renderCard)}
            </div>
          ))}
        </div>

        {/* Right */}
        <div className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {renderRight()}
        </div>
      </div>
    </div>
  )
}
