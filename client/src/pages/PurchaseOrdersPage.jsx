import { useEffect, useState } from "react"
import { ToastContainer, useToasts } from "../components/Toast"
import {
  fetchPurchaseOrders,
  createPurchaseOrder,
  updatePurchaseOrderStatus,
  deletePurchaseOrder,
  fetchProducts,
  fetchManufacturers,
} from "../api/inventoryApi"

const STATUS_CONFIG = {
  ordered:    { label: "Ordered",    bg: "bg-blue-100",   text: "text-blue-700",   dot: "bg-blue-500"   },
  in_transit: { label: "In Transit", bg: "bg-amber-100",  text: "text-amber-700",  dot: "bg-amber-500"  },
  received:   { label: "Received",   bg: "bg-emerald-100",text: "text-emerald-700",dot: "bg-emerald-500" },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.ordered
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text}`}>
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
    emerald:"bg-emerald-50 border-emerald-200",
  }
  const textColors = {
    slate: "text-slate-900", blue: "text-blue-700", amber: "text-amber-700", emerald: "text-emerald-700",
  }
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${colors[color]}`}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${textColors[color]}`}>{value ?? "—"}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  )
}

function LogOrderModal({ products, manufacturers, onClose, onSave }) {
  const [form, setForm] = useState({
    product_id: "",
    supplier_id: "",
    quantity_ordered: "",
    order_date: new Date().toISOString().split("T")[0],
    expected_delivery_date: "",
    notes: "",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const set = (field, val) => setForm((f) => ({ ...f, [field]: val }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.product_id || !form.quantity_ordered) {
      setError("Product and quantity are required.")
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
        status: "ordered",
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
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">Log Purchase Order</h2>
          <p className="text-sm text-slate-500">Record a new order placed with a manufacturer</p>
        </div>
        <form onSubmit={handleSubmit} className="grid gap-4 p-6">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Component *</label>
            <select
              value={form.product_id}
              onChange={(e) => set("product_id", e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
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
              type="number" min="1"
              value={form.quantity_ordered}
              onChange={(e) => set("quantity_ordered", e.target.value)}
              placeholder="e.g. 500"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Order Date</label>
              <input
                type="date"
                value={form.order_date}
                onChange={(e) => set("order_date", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Expected Delivery</label>
              <input
                type="date"
                value={form.expected_delivery_date}
                onChange={(e) => set("expected_delivery_date", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="PO number, remarks…"
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 resize-none"
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
              {saving ? "Saving…" : "Log Order"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function MarkReceivedModal({ order, onClose, onConfirm }) {
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await onConfirm(order)
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
        <div className="p-6">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-center text-lg font-bold text-slate-900">Mark as Received?</h3>
          <p className="mt-2 text-center text-sm text-slate-500">
            This will add <strong>{order.quantity_ordered.toLocaleString("en-IN")} units</strong> of{" "}
            <strong>{order.product_name}</strong> to warehouse stock automatically.
          </p>
        </div>
        <div className="flex gap-2 border-t border-slate-200 p-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm} disabled={loading}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? "Updating…" : "Confirm Received"}
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

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [manufacturers, setManufacturers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [showLogModal, setShowLogModal] = useState(false)
  const [receivingOrder, setReceivingOrder] = useState(null)
  const [statusFilter, setStatusFilter] = useState("active")
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

  const handleCreate = async (payload) => {
    await createPurchaseOrder(payload)
    addToast("Order logged successfully", "success")
    load()
  }

  const handleStatusUpdate = async (id, status) => {
    await updatePurchaseOrderStatus(id, status)
    addToast(`Marked as ${STATUS_CONFIG[status].label}`, "success")
    load()
  }

  const handleReceived = async (order) => {
    await updatePurchaseOrderStatus(order.id, "received", true)
    addToast(`${order.quantity_ordered.toLocaleString("en-IN")} units of ${order.product_name} added to stock`, "success")
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

  const pending    = orders.filter((o) => o.status === "ordered")
  const inTransit  = orders.filter((o) => o.status === "in_transit")
  const received   = orders.filter((o) => o.status === "received")
  const qtyOnOrder = [...pending, ...inTransit].reduce((s, o) => s + o.quantity_ordered, 0)

  const filtered = statusFilter === "active"
    ? orders.filter((o) => o.status !== "received")
    : statusFilter === "received"
    ? received
    : orders

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Purchase Orders</h1>
          <p className="text-sm text-slate-500">Track orders placed with manufacturers — stock auto-updates on receipt</p>
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
        <StatCard label="Pending Orders" value={pending.length} sub="waiting on manufacturer" color="blue" />
        <StatCard label="In Transit" value={inTransit.length} sub="shipped, not yet received" color="amber" />
        <StatCard label="Received" value={received.length} sub="all time" color="emerald" />
        <StatCard label="Units on Order" value={qtyOnOrder.toLocaleString("en-IN")} sub="pending + in transit" color="slate" />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 w-fit">
        {[
          { key: "active",   label: "Active" },
          { key: "received", label: "Received" },
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
            {statusFilter === "active" ? "All caught up — no pending orders." : "No orders in this category yet."}
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
                  <th className="px-4 py-3 text-right">Qty Ordered</th>
                  <th className="px-4 py-3 text-left">Order Date</th>
                  <th className="px-4 py-3 text-left">Expected By</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Notes</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((order) => {
                  const days = daysUntil(order.expected_delivery_date)
                  const isOverdue = days !== null && days < 0 && order.status !== "received"
                  return (
                    <tr key={order.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{order.product_name}</td>
                      <td className="px-4 py-3 text-slate-500">{order.supplier_name ?? <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                        {order.quantity_ordered.toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{fmtDate(order.order_date)}</td>
                      <td className="px-4 py-3">
                        {order.expected_delivery_date ? (
                          <span className={isOverdue ? "font-medium text-red-600" : "text-slate-500"}>
                            {fmtDate(order.expected_delivery_date)}
                            {days !== null && order.status !== "received" && (
                              <span className="ml-1 text-xs text-slate-400">
                                ({isOverdue ? `${Math.abs(days)}d late` : `${days}d`})
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                      <td className="px-4 py-3 max-w-[180px] truncate text-slate-400 text-xs">{order.notes ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {order.status === "ordered" && (
                            <button
                              onClick={() => handleStatusUpdate(order.id, "in_transit")}
                              className="rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                            >
                              Shipped
                            </button>
                          )}
                          {order.status === "in_transit" && (
                            <button
                              onClick={() => setReceivingOrder(order)}
                              className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                            >
                              Received
                            </button>
                          )}
                          {order.status === "ordered" && (
                            <button
                              onClick={() => setReceivingOrder(order)}
                              className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                            >
                              Received
                            </button>
                          )}
                          {order.status !== "received" && (
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
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showLogModal && (
        <LogOrderModal
          products={products}
          manufacturers={manufacturers}
          onClose={() => setShowLogModal(false)}
          onSave={handleCreate}
        />
      )}

      {receivingOrder && (
        <MarkReceivedModal
          order={receivingOrder}
          onClose={() => setReceivingOrder(null)}
          onConfirm={handleReceived}
        />
      )}
    </div>
  )
}
