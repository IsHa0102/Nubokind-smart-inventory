import { useEffect, useState } from "react"
import {
  fetchPlannedShipments,
  createPlannedShipment,
  updatePlannedShipment,
  updatePlannedShipmentStatus,
  deletePlannedShipment,
  fetchDestinations,
  fetchProducts,
} from "../api/inventoryApi"
import { SHIPMENT_PRODUCTS, buildAllDeductions } from "../lib/shipmentConfig"

const statusStyles = {
  pending:  "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
}

const statusLabel = { pending: "Pending", approved: "Approved", rejected: "Rejected" }

function formatDate(val) {
  return new Date(val).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function formatPlannedDate(val) {
  if (!val) return null
  // planned_date is "YYYY-MM-DD" — parse as local date to avoid UTC offset shift
  const [y, m, d] = val.split("-")
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

// ── Feasibility Check ──────────────────────────────────────────────────────
function FeasibilityCheck({ lines }) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!lines || lines.length === 0) { setLoading(false); setResult([]); return }
    fetchProducts().then((products) => {
      const nameToStock = {}
      products.forEach((p) => { nameToStock[p.name] = p.stock ?? 0 })
      const mapped = lines.map((l) => ({ productKey: l.sku_key, variantKey: l.variant_key, qty: l.quantity }))
      const requirements = buildAllDeductions(mapped)
      setResult(requirements.map((r) => ({
        ...r,
        stock: nameToStock[r.name] ?? 0,
        ok: (nameToStock[r.name] ?? 0) >= r.quantity,
      })))
      setLoading(false)
    })
  }, [lines])

  if (loading) return <p className="text-xs text-slate-400">Checking stock...</p>
  if (!result || result.length === 0) return <p className="text-xs text-slate-400">No components to check.</p>

  const shortages = result.filter((r) => !r.ok)
  const allOk = shortages.length === 0

  return (
    <div className="space-y-3">
      <div className={`rounded-lg px-4 py-3 text-sm font-medium ${allOk ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
        {allOk ? "Stock sufficient — can ship" : `Insufficient stock — ${shortages.length} item${shortages.length > 1 ? "s" : ""} short`}
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

// ── Shipment Form (create + edit) ──────────────────────────────────────────
function ShipmentForm({ destinations, initialValues = {}, onSubmit, onCancel, submitLabel = "Create Shipment" }) {
  const [destination, setDestination] = useState(initialValues.destination ?? "")
  const [plannedDate, setPlannedDate] = useState(initialValues.planned_date ?? "")
  const [notes, setNotes] = useState(initialValues.notes ?? "")
  const [lines, setLines] = useState(initialValues.lines ?? [])
  const [productKey, setProductKey] = useState("")
  const [variantKey, setVariantKey] = useState("")
  const [qty, setQty] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const selectedProduct = SHIPMENT_PRODUCTS.find((p) => p.key === productKey)

  const addLine = () => {
    if (!productKey || !qty || Number(qty) <= 0) return
    if (selectedProduct?.variants && !variantKey) return
    const variant = selectedProduct?.variants?.find((v) => v.key === variantKey)
    const label = variant ? `${selectedProduct.label} — ${variant.label}` : selectedProduct.label
    setLines((prev) => [...prev, { sku_key: productKey, variant_key: variantKey || null, quantity: Number(qty), label }])
    setProductKey("")
    setVariantKey("")
    setQty("")
  }

  const removeLine = (i) => setLines((prev) => prev.filter((_, idx) => idx !== i))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!destination) { setError("Please select a destination."); return }
    if (lines.length === 0) { setError("Add at least one SKU line."); return }
    setSubmitting(true)
    setError("")
    try {
      await onSubmit({ destination, planned_date: plannedDate || null, notes, lines })
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Destination</label>
          <select
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">Select destination…</option>
            {destinations.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Planned Ship Date</label>
          <input
            type="date"
            value={plannedDate}
            onChange={(e) => setPlannedDate(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-slate-600">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Any context for this order…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 resize-none"
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
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 text-slate-800">{l.label}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-700 font-medium">{l.quantity}</td>
                    <td className="px-2 py-1.5 text-right">
                      <button type="button" onClick={() => removeLine(i)} className="text-slate-400 hover:text-rose-500 text-xs">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-rose-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? "Saving…" : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── Detail Panel ────────────────────────────────────────────────────────────
function DetailPanel({ shipment, onStatusChange, onDelete, onEdit }) {
  const [updating, setUpdating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleStatus = async (status) => {
    setUpdating(true)
    try { await updatePlannedShipmentStatus(shipment.id, status); onStatusChange(shipment.id, status) }
    catch (e) { alert(e.message) }
    finally { setUpdating(false) }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try { await deletePlannedShipment(shipment.id); onDelete(shipment.id) }
    catch (e) { alert(e.message) }
    finally { setDeleting(false); setConfirmDelete(false) }
  }

  const lines = shipment.warehouse_planned_shipment_lines || []
  const planned = formatPlannedDate(shipment.planned_date)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400">Created {formatDate(shipment.created_at)}</p>
          <h3 className="text-lg font-bold text-slate-900">{shipment.destination}</h3>
          {planned && (
            <p className="mt-0.5 text-sm font-medium text-indigo-600">Ship by {planned}</p>
          )}
          {shipment.notes && <p className="mt-1 text-sm text-slate-500">{shipment.notes}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[shipment.status]}`}>
            {statusLabel[shipment.status]}
          </span>
          <button
            onClick={onEdit}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Edit
          </button>
        </div>
      </div>

      {/* SKU lines */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Order Lines</p>
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
                  {lines.map((l) => (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-800">{l.label}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900">{l.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {/* Feasibility check */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stock Feasibility Check</p>
        <FeasibilityCheck lines={lines} />
        <p className="text-[11px] text-slate-400">Note: corrugation boxes are excluded — they are calculated automatically at shipment time.</p>
      </div>

      {/* Approve / Reject */}
      {shipment.status === "pending" && (
        <div className="flex gap-2">
          <button
            onClick={() => handleStatus("approved")}
            disabled={updating}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            Approve
          </button>
          <button
            onClick={() => handleStatus("rejected")}
            disabled={updating}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition-colors"
          >
            Reject
          </button>
        </div>
      )}

      <div className="border-t border-slate-100 pt-3">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-600">Delete this planned shipment?</span>
            <button onClick={handleDelete} disabled={deleting} className="rounded px-2.5 py-1 text-xs font-semibold bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-50">
              {deleting ? "…" : "Yes, delete"}
            </button>
            <button onClick={() => setConfirmDelete(false)} className="rounded px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="text-xs text-rose-500 hover:text-rose-700 transition-colors">
            Delete shipment
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function PlannedShipmentsPage() {
  const [shipments, setShipments] = useState([])
  const [destinations, setDestinations] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    Promise.all([fetchPlannedShipments(), fetchDestinations()]).then(([s, d]) => {
      setShipments(s)
      setDestinations(d)
      setLoading(false)
    })
  }, [])

  const selected = shipments.find((s) => s.id === selectedId)

  const refresh = async () => {
    const fresh = await fetchPlannedShipments()
    setShipments(fresh)
    return fresh
  }

  const handleCreate = async ({ destination, planned_date, notes, lines }) => {
    await createPlannedShipment({ destination, planned_date, notes, lines })
    const fresh = await refresh()
    setCreating(false)
    if (fresh.length > 0) setSelectedId(fresh[0].id)
  }

  const handleEdit = async ({ destination, planned_date, notes, lines }) => {
    await updatePlannedShipment(selectedId, { destination, planned_date, notes, lines })
    await refresh()
    setEditing(false)
  }

  const handleStatusChange = (id, status) => {
    setShipments((prev) => prev.map((s) => s.id === id ? { ...s, status } : s))
  }

  const handleDelete = (id) => {
    setShipments((prev) => prev.filter((s) => s.id !== id))
    setSelectedId(null)
    setEditing(false)
  }

  const pending  = shipments.filter((s) => s.status === "pending")
  const approved = shipments.filter((s) => s.status === "approved")
  const rejected = shipments.filter((s) => s.status === "rejected")

  const renderCard = (s) => {
    const planned = formatPlannedDate(s.planned_date)
    return (
      <button
        key={s.id}
        onClick={() => { setSelectedId(s.id); setCreating(false); setEditing(false) }}
        className={`w-full text-left rounded-xl border p-3 transition-all ${
          selectedId === s.id ? "border-indigo-400 bg-indigo-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{s.destination}</p>
            {planned
              ? <p className="text-xs font-medium text-indigo-500 mt-0.5">Ship by {planned}</p>
              : <p className="text-xs text-slate-400 mt-0.5">{formatDate(s.created_at)}</p>}
            <p className="text-xs text-slate-400 mt-0.5">{(s.warehouse_planned_shipment_lines || []).length} SKU{(s.warehouse_planned_shipment_lines || []).length !== 1 ? "s" : ""}</p>
          </div>
          <span className={`shrink-0 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusStyles[s.status]}`}>
            {statusLabel[s.status]}
          </span>
        </div>
      </button>
    )
  }

  // Build initialValues for edit form from the selected shipment
  const editInitialValues = selected ? {
    destination: selected.destination,
    planned_date: selected.planned_date ?? "",
    notes: selected.notes ?? "",
    lines: (selected.warehouse_planned_shipment_lines || []).map((l) => ({
      sku_key: l.sku_key,
      variant_key: l.variant_key,
      quantity: l.quantity,
      label: l.label,
    })),
  } : {}

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-900">Order Planning</h2>

      <div className="flex gap-4 items-start">
        {/* Left: shipment list */}
        <div className="w-72 shrink-0 space-y-3">
          <button
            onClick={() => { setCreating(true); setEditing(false); setSelectedId(null) }}
            className="w-full rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50 py-2.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-100 hover:border-indigo-400 transition-colors"
          >
            + New Planned Shipment
          </button>

          {loading && <p className="text-sm text-slate-400 px-1">Loading…</p>}
          {!loading && shipments.length === 0 && (
            <p className="text-sm text-slate-400 px-1">No planned shipments yet.</p>
          )}

          {pending.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 px-1">Pending</p>
              {pending.map(renderCard)}
            </div>
          )}
          {approved.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 px-1">Approved</p>
              {approved.map(renderCard)}
            </div>
          )}
          {rejected.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 px-1">Rejected</p>
              {rejected.map(renderCard)}
            </div>
          )}
        </div>

        {/* Right: detail / create / edit */}
        <div className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {creating ? (
            <div className="space-y-4">
              <h3 className="text-base font-bold text-slate-900">New Planned Shipment</h3>
              <ShipmentForm
                destinations={destinations}
                onSubmit={handleCreate}
                onCancel={() => setCreating(false)}
                submitLabel="Create Shipment"
              />
            </div>
          ) : editing && selected ? (
            <div className="space-y-4">
              <h3 className="text-base font-bold text-slate-900">Edit — {selected.destination}</h3>
              <ShipmentForm
                destinations={destinations}
                initialValues={editInitialValues}
                onSubmit={handleEdit}
                onCancel={() => setEditing(false)}
                submitLabel="Save Changes"
              />
            </div>
          ) : selected ? (
            <DetailPanel
              key={selected.id}
              shipment={selected}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onEdit={() => setEditing(true)}
            />
          ) : (
            <div className="flex h-48 items-center justify-center text-sm text-slate-400">
              Select a planned shipment or create a new one.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
