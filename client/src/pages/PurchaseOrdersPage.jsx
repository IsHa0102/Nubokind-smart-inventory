import { Fragment, useEffect, useState } from "react"
import { ToastContainer, useToasts } from "../components/Toast"
import {
  fetchPurchaseOrders,
  createPurchaseOrder,
  updatePurchaseOrder,
  updatePurchaseOrderStatus,
  receivePurchaseOrder,
  deletePurchaseOrder,
  fetchProducts,
  fetchManufacturers,
} from "../api/inventoryApi"

const STATUS_CONFIG = {
  ordered:      { label: "Ordered",       bg: "bg-blue-100",    text: "text-blue-700",    dot: "bg-blue-500"    },
  in_transit:   { label: "In Transit",    bg: "bg-amber-100",   text: "text-amber-700",   dot: "bg-amber-500"   },
  partial:      { label: "Part Received", bg: "bg-violet-100",  text: "text-violet-700",  dot: "bg-violet-500"  },
  received:     { label: "Received",      bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
  closed_short: { label: "Closed Short",  bg: "bg-slate-100",   text: "text-slate-600",   dot: "bg-slate-400"   },
}

// The stored status is ordered / in_transit / received (sql/004). "Part
// received" and "closed short" are read off the quantities, never stored, so
// they can't disagree with them.
function displayStatus(order) {
  if (order.status === "received") {
    return order.quantity_received < order.quantity_ordered ? "closed_short" : "received"
  }
  return order.quantity_received > 0 ? "partial" : order.status
}

const n = (v) => Number(v || 0).toLocaleString("en-IN")
// Local calendar date, YYYY-MM-DD. toISOString() would give yesterday before 5:30 am IST.
const todayStr = () => new Date().toLocaleDateString("en-CA")

function StatusBadge({ order }) {
  const cfg = STATUS_CONFIG[displayStatus(order)] ?? STATUS_CONFIG.ordered
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function StatCard({ label, value, sub, color = "slate" }) {
  const colors = {
    slate:  "bg-white border-slate-200",
    blue:   "bg-blue-50 border-blue-200",
    amber:  "bg-amber-50 border-amber-200",
    violet: "bg-violet-50 border-violet-200",
  }
  const textColors = {
    slate: "text-slate-900", blue: "text-blue-700", amber: "text-amber-700", violet: "text-violet-700",
  }
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${colors[color]}`}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${textColors[color]}`}>{value ?? "—"}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  )
}

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-400"

// One modal for both logging a new order and editing an existing one (`order`).
function OrderModal({ order, products, manufacturers, onClose, onSave }) {
  const editing = !!order
  // A closed order's stock has already been added, so its component, quantity
  // and status are locked (see updatePurchaseOrder). An open order with
  // deliveries keeps its component and can't drop below what already arrived.
  const locked = order?.status === "received"
  const alreadyIn = order?.quantity_received ?? 0
  const [form, setForm] = useState({
    product_id: order ? String(order.product_id) : "",
    supplier_id: order?.supplier_id ? String(order.supplier_id) : "",
    quantity_ordered: order ? String(order.quantity_ordered) : "",
    order_date: editing ? (order.order_date ?? "") : todayStr(),
    expected_delivery_date: order?.expected_delivery_date ?? "",
    status: order?.status ?? "ordered",
    notes: order?.notes ?? "",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const set = (field, val) => setForm((f) => ({ ...f, [field]: val }))
  const becomingReceived = editing && !locked && form.status === "received"
  const restToReceive = Math.max(Number(form.quantity_ordered || 0) - alreadyIn, 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.product_id || !form.quantity_ordered) {
      setError("Product and quantity are required.")
      return
    }
    if (Number(form.quantity_ordered) < 1) {
      setError("Quantity must be at least 1.")
      return
    }
    if (!locked && Number(form.quantity_ordered) < alreadyIn) {
      setError(`${n(alreadyIn)} units have already arrived — the order can't be less than that.`)
      return
    }
    if (form.order_date && form.expected_delivery_date && form.expected_delivery_date < form.order_date) {
      setError("Expected delivery is before the order date.")
      return
    }
    setSaving(true)
    setError("")
    try {
      await onSave({
        product_id: Number(form.product_id),
        supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
        quantity_ordered: Number(form.quantity_ordered),
        order_date: form.order_date || null,
        expected_delivery_date: form.expected_delivery_date || null,
        notes: form.notes || null,
        status: form.status,
      })
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">{editing ? "Edit Purchase Order" : "Log Purchase Order"}</h2>
          <p className="text-sm text-slate-500">
            {locked
              ? "Closed — stock was already added, so component, quantity and status are locked"
              : alreadyIn > 0
              ? `${n(alreadyIn)} units already received — component is locked`
              : editing
              ? "Changes feed straight into manufacturing planning"
              : "Record a new order placed with a manufacturer"}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="grid gap-4 p-6">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Component *</label>
            <select
              value={form.product_id}
              onChange={(e) => set("product_id", e.target.value)}
              disabled={locked || alreadyIn > 0}
              className={inputCls}
              required
            >
              <option value="">Select component…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Supplier / Manufacturer</label>
            <select
              value={form.supplier_id}
              onChange={(e) => set("supplier_id", e.target.value)}
              className={inputCls}
            >
              <option value="">None / Unknown</option>
              {manufacturers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Quantity Ordered *</label>
            <input
              type="number" min={Math.max(1, alreadyIn)}
              value={form.quantity_ordered}
              onChange={(e) => set("quantity_ordered", e.target.value)}
              disabled={locked}
              placeholder="e.g. 500"
              className={inputCls}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Order Placed</label>
              <input
                type="date"
                value={form.order_date}
                max={todayStr()}
                onChange={(e) => set("order_date", e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Expected Delivery</label>
              <input
                type="date"
                value={form.expected_delivery_date}
                onChange={(e) => set("expected_delivery_date", e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          {!form.expected_delivery_date && !locked && (
            <p className="-mt-2 text-xs text-slate-400">
              No delivery date — planning will assume the supplier&apos;s usual lead time.
            </p>
          )}

          {editing && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Status</label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                disabled={locked}
                className={inputCls}
              >
                <option value="ordered">Ordered</option>
                <option value="in_transit">In Transit</option>
                <option value="received">{locked ? "Received" : "Received — everything still to come"}</option>
              </select>
              {!locked && (
                <p className="mt-1 text-xs text-slate-400">
                  Part delivery? Close this and use <strong>Receive</strong> on the order instead.
                </p>
              )}
            </div>
          )}
          {becomingReceived && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              Saving will add {n(restToReceive)} units to warehouse stock and close the order.
            </p>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="PO number, remarks…"
              rows={2}
              className={`${inputCls} resize-none`}
            />
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button" onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={saving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : editing ? "Save Changes" : "Log Order"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Record one delivery: how many arrived and on which day. Defaults to
// everything still to come, today; a part delivery is just a smaller number.
function ReceiveModal({ order, onClose, onConfirm }) {
  const remaining = order.remaining
  const [qty, setQty] = useState(String(remaining))
  const [receivedOn, setReceivedOn] = useState(todayStr())
  const [notes, setNotes] = useState("")
  const [closeShort, setCloseShort] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const q = Number(qty || 0)
  const after = order.quantity_received + q
  const stillOpen = Math.max(order.quantity_ordered - after, 0)
  const over = Math.max(after - order.quantity_ordered, 0)
  const closes = closeShort || stillOpen === 0

  const handleConfirm = async () => {
    if (!Number.isInteger(q) || q < 0) return setError("Enter a whole number of units.")
    if (q === 0 && !closeShort) return setError("Enter the units that arrived.")
    if (!receivedOn) return setError("Pick the day it arrived.")
    setSaving(true)
    setError("")
    try {
      await onConfirm(order, { quantity: q, receivedOn, notes, close: closeShort })
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">Receive Delivery</h2>
          <p className="text-sm text-slate-500">
            {order.product_name}{order.supplier_name ? ` · ${order.supplier_name}` : ""}
          </p>
        </div>

        <div className="grid gap-4 p-6">
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ["Ordered", order.quantity_ordered],
              ["Received so far", order.quantity_received],
              ["Still to come", remaining],
            ].map(([label, v]) => (
              <div key={label} className="rounded-lg bg-slate-50 px-2 py-2">
                <p className="text-[11px] text-slate-500">{label}</p>
                <p className="text-lg font-bold tabular-nums text-slate-900">{n(v)}</p>
              </div>
            ))}
          </div>

          {order.receipts.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Earlier deliveries</p>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-xs">
                {order.receipts.map((r) => (
                  <li key={r.id} className="flex justify-between gap-3 px-3 py-1.5">
                    <span className="text-slate-500">{fmtDate(r.received_on)}{r.notes ? ` · ${r.notes}` : ""}</span>
                    <span className="font-medium tabular-nums text-slate-900">{n(r.quantity)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Units arrived *</label>
              <input
                type="number" min="0" step="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className={inputCls}
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Arrived on *</label>
              <input
                type="date"
                value={receivedOn}
                max={todayStr()}
                onChange={(e) => setReceivedOn(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Notes</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Invoice / challan no., remarks…"
              className={inputCls}
            />
          </div>

          {q < remaining && (
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={closeShort}
                onChange={(e) => setCloseShort(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Supplier won&apos;t send the rest — close this order
                <span className="block text-xs text-slate-400">
                  The {n(Math.max(remaining - q, 0))} missing units stop counting as on order.
                </span>
              </span>
            </label>
          )}

          <p className={`rounded-lg px-3 py-2 text-xs ${closes ? "bg-emerald-50 text-emerald-700" : "bg-violet-50 text-violet-700"}`}>
            {q > 0 && <>Adds <strong>{n(q)}</strong> units to warehouse stock. </>}
            {over > 0
              ? `That's ${n(over)} more than ordered — the order closes.`
              : closeShort
              ? `Order closes with ${n(after)} of ${n(order.quantity_ordered)} received.`
              : stillOpen === 0
              ? "This completes the order."
              : `${n(stillOpen)} still to come — the order stays open.`}
          </p>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex gap-2 border-t border-slate-200 p-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm} disabled={saving}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : q > 0 ? `Add ${n(q)} to stock` : "Close order"}
          </button>
        </div>
      </div>
    </div>
  )
}

const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"

const daysUntil = (dateStr) => {
  if (!dateStr) return null
  const diff = (new Date(dateStr) - new Date()) / 86400000
  return Math.ceil(diff)
}

function ReceivedCell({ order, expanded, onToggle }) {
  const pct = Math.min(100, Math.round((order.quantity_received / order.quantity_ordered) * 100))
  const short = order.status === "received" ? order.quantity_ordered - order.quantity_received : 0
  return (
    <div className="min-w-[120px] text-right">
      <p className="tabular-nums">
        <span className="font-semibold text-slate-900">{n(order.quantity_received)}</span>
        <span className="text-slate-400"> / {n(order.quantity_ordered)}</span>
      </p>
      <div className="ml-auto mt-1 h-1 w-24 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${order.status === "received" ? "bg-emerald-500" : "bg-violet-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-0.5 text-[11px] text-slate-400">
        {order.remaining > 0 && order.quantity_received > 0 && `${n(order.remaining)} to come · `}
        {short > 0 && `closed ${n(short)} short · `}
        {order.receipts.length > 0 && (
          <button onClick={onToggle} className="text-indigo-600 hover:underline">
            {order.receipts.length} {order.receipts.length === 1 ? "delivery" : "deliveries"} {expanded ? "▴" : "▾"}
          </button>
        )}
      </p>
    </div>
  )
}

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [manufacturers, setManufacturers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [showLogModal, setShowLogModal] = useState(false)
  const [receivingOrder, setReceivingOrder] = useState(null)
  const [editingOrder, setEditingOrder] = useState(null)
  const [statusFilter, setStatusFilter] = useState("active")
  const [expanded, setExpanded] = useState(() => new Set())
  const { toasts, addToast, removeToast } = useToasts()

  const load = async () => {
    setLoading(true)
    setError("")
    try {
      const [o, p, m] = await Promise.all([
        fetchPurchaseOrders(),
        fetchProducts(),
        fetchManufacturers(),
      ])
      setOrders(o)
      setProducts(p)
      setManufacturers(m)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const toggleExpanded = (id) =>
    setExpanded((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const handleCreate = async (payload) => {
    await createPurchaseOrder(payload) // status is always "ordered" for a new order
    addToast("Order logged successfully", "success")
    load()
  }

  const handleEdit = async (payload) => {
    const order = editingOrder
    await updatePurchaseOrder(order.id, payload)
    const nowReceived = order.status !== "received" && payload.status === "received"
    const added = Math.max(payload.quantity_ordered - order.quantity_received, 0)
    addToast(nowReceived ? `${n(added)} units added to stock` : "Order updated", "success")
    load()
  }

  const handleStatusUpdate = async (id, status) => {
    try {
      await updatePurchaseOrderStatus(id, status)
      addToast(`Marked as ${STATUS_CONFIG[status].label}`, "success")
      load()
    } catch (err) {
      addToast(err.message, "error")
    }
  }

  const handleReceive = async (order, receipt) => {
    const res = await receivePurchaseOrder(order.id, receipt)
    addToast(
      receipt.quantity > 0
        ? `${n(receipt.quantity)} units of ${order.product_name} added to stock` +
          (res?.remaining > 0 && res?.status !== "received" ? ` · ${n(res.remaining)} still to come` : "")
        : `Order closed with ${n(order.quantity_received)} of ${n(order.quantity_ordered)} received`,
      "success",
    )
    load()
  }

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this purchase order?")) return
    try {
      await deletePurchaseOrder(id)
      addToast("Order deleted", "success")
      load()
    } catch (err) {
      addToast(err.message, "error")
    }
  }

  const open      = orders.filter((o) => o.status !== "received")
  const partial   = open.filter((o) => o.quantity_received > 0)
  const pending   = open.filter((o) => o.status === "ordered" && o.quantity_received === 0)
  const inTransit = open.filter((o) => o.status === "in_transit" && o.quantity_received === 0)
  const closed    = orders.filter((o) => o.status === "received")
  const toCome    = open.reduce((s, o) => s + o.remaining, 0)

  const filtered = statusFilter === "active" ? open : statusFilter === "received" ? closed : orders

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Purchase Orders</h1>
          <p className="text-sm text-slate-500">Track orders placed with manufacturers — stock updates with every delivery, part or full</p>
        </div>
        <button
          onClick={() => setShowLogModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Log Order
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Pending Orders" value={pending.length} sub="nothing received yet" color="blue" />
        <StatCard label="In Transit" value={inTransit.length} sub="shipped, not yet received" color="amber" />
        <StatCard label="Part Received" value={partial.length} sub="some delivered, rest to come" color="violet" />
        <StatCard label="Units Still to Come" value={n(toCome)} sub="ordered − received, open orders" color="slate" />
      </div>

      {/* Filter tabs */}
      <div className="flex w-fit gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
        {[
          { key: "active",   label: `Active (${open.length})` },
          { key: "received", label: `Closed (${closed.length})` },
          { key: "all",      label: "All" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === tab.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading orders…</div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center">
          <p className="text-sm font-medium text-slate-500">No orders found</p>
          <p className="mt-1 text-xs text-slate-400">
            {statusFilter === "active" ? "All caught up — no open orders." : "No orders in this category yet."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 text-left">Component</th>
                  <th className="px-4 py-3 text-left">Supplier</th>
                  <th className="px-4 py-3 text-left">Ordered On</th>
                  <th className="px-4 py-3 text-right">Received / Ordered</th>
                  <th className="px-4 py-3 text-left">Expected By</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Notes</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((order) => {
                  const isOpen = order.status !== "received"
                  const days = daysUntil(order.expected_delivery_date)
                  const isOverdue = days !== null && days < 0 && isOpen
                  const isExpanded = expanded.has(order.id)
                  return (
                    <Fragment key={order.id}>
                      <tr className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{order.product_name}</td>
                        <td className="px-4 py-3 text-slate-500">{order.supplier_name ?? <span className="text-slate-300">—</span>}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                          {order.order_date ? fmtDate(order.order_date) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <ReceivedCell order={order} expanded={isExpanded} onToggle={() => toggleExpanded(order.id)} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {order.expected_delivery_date ? (
                            <span className={isOverdue ? "font-medium text-red-600" : "text-slate-500"}>
                              {fmtDate(order.expected_delivery_date)}
                              {days !== null && isOpen && (
                                <span className="ml-1 text-xs text-slate-400">
                                  ({isOverdue ? `${Math.abs(days)}d late` : `${days}d`})
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3"><StatusBadge order={order} /></td>
                        <td className="max-w-[180px] truncate px-4 py-3 text-xs text-slate-400">{order.notes ?? "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setEditingOrder(order)}
                              className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                            >
                              Edit
                            </button>
                            {order.status === "ordered" && (
                              <button
                                onClick={() => handleStatusUpdate(order.id, "in_transit")}
                                className="rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                              >
                                Shipped
                              </button>
                            )}
                            {isOpen && (
                              <button
                                onClick={() => setReceivingOrder(order)}
                                className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                              >
                                Receive
                              </button>
                            )}
                            {isOpen && order.quantity_received === 0 && (
                              <button
                                onClick={() => handleDelete(order.id)}
                                className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                                title="Delete order"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={8} className="px-4 py-2">
                            <ul className="ml-auto max-w-md divide-y divide-slate-200 text-xs">
                              {order.receipts.map((r, i) => (
                                <li key={r.id} className="flex justify-between gap-3 py-1">
                                  <span className="text-slate-500">
                                    Delivery {i + 1} · {fmtDate(r.received_on)}{r.notes ? ` · ${r.notes}` : ""}
                                  </span>
                                  <span className="font-medium tabular-nums text-slate-900">{n(r.quantity)}</span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showLogModal && (
        <OrderModal
          products={products}
          manufacturers={manufacturers}
          onClose={() => setShowLogModal(false)}
          onSave={handleCreate}
        />
      )}

      {editingOrder && (
        <OrderModal
          order={editingOrder}
          products={products}
          manufacturers={manufacturers}
          onClose={() => setEditingOrder(null)}
          onSave={handleEdit}
        />
      )}

      {receivingOrder && (
        <ReceiveModal
          order={receivingOrder}
          onClose={() => setReceivingOrder(null)}
          onConfirm={handleReceive}
        />
      )}
    </div>
  )
}
