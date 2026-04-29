import { useState } from "react"
import { createProduct, deleteProduct, updateProduct } from "../api/inventoryApi"
import ConfirmModal from "./ConfirmModal"
import EditModal from "./EditModal"

const PRODUCT_FIELDS = [
  { key: "name", label: "Item Name", type: "text", required: true },
  { key: "item_type", label: "Item Type", type: "select", options: ["Product", "Packaging"], required: true },
  { key: "stock", label: "Stock", type: "number", min: "0", required: true },
  { key: "low_stock_threshold", label: "Low Stock Threshold", type: "number", min: "0", required: true },
]

function ProductList({ products, onRefresh, addToast, search }) {
  const [addForm, setAddForm] = useState({ name: "", item_type: "Product", stock: "", low_stock_threshold: "" })
  const [adding, setAdding] = useState(false)

  const [editTarget, setEditTarget] = useState(null) // product object
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState(null) // product object
  const [deleting, setDeleting] = useState(false)

  // Filtered list
  const filtered = search
    ? products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : products

  // ── Add ────────────────────────────────────────────────────
  const handleAdd = async (e) => {
    e.preventDefault()
    setAdding(true)
    try {
      await createProduct({
        name: addForm.name,
        item_type: addForm.item_type,
        stock: Number(addForm.stock),
        low_stock_threshold: Number(addForm.low_stock_threshold),
      })
      setAddForm({ name: "", item_type: "Product", stock: "", low_stock_threshold: "" })
      onRefresh()
      addToast("Item added successfully", "success")
    } catch (err) {
      addToast(err?.response?.data?.message || "Failed to add item", "error")
    } finally {
      setAdding(false)
    }
  }

  // ── Edit ───────────────────────────────────────────────────
  const handleSave = async (values) => {
    setSaving(true)
    try {
      await updateProduct(editTarget.id, {
        name: values.name,
        item_type: values.item_type || editTarget.item_type,
        stock: Number(values.stock),
        low_stock_threshold: Number(values.low_stock_threshold),
      })
      setEditTarget(null)
      onRefresh()
      addToast("Item updated successfully", "success")
    } catch (err) {
      addToast(err?.response?.data?.message || "Failed to update item", "error")
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ─────────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteProduct(deleteTarget.id)
      setDeleteTarget(null)
      onRefresh()
      addToast("Item deleted successfully", "success")
    } catch (err) {
      setDeleteTarget(null)
      addToast(err?.response?.data?.message || "Failed to delete item", "error")
    } finally {
      setDeleting(false)
    }
  }

  const stockBadge = (p) => {
    if (p.stock === 0)
      return <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Out of stock</span>
    if (p.stock <= p.low_stock_threshold)
      return <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Low stock</span>
    return <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">In stock</span>
  }

  return (
    <>
      {/* ── Add form ── */}
      <form onSubmit={handleAdd} className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
<p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Add New Item</p>
        <div className="flex flex-wrap gap-2">
            <input
              required
              placeholder="Item name"
              value={addForm.name}
              onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
              className="min-w-[160px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            <select
              value={addForm.item_type}
              onChange={(e) => setAddForm((p) => ({ ...p, item_type: e.target.value }))}
              className="min-w-[120px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            >
              <option value="Product">Product</option>
              <option value="Packaging">Packaging</option>
            </select>
          <input
            required
            type="number"
            min="0"
            placeholder="Stock"
            value={addForm.stock}
            onChange={(e) => setAddForm((p) => ({ ...p, stock: e.target.value }))}
            className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          <input
            required
            type="number"
            min="0"
            placeholder="Threshold"
            value={addForm.low_stock_threshold}
            onChange={(e) => setAddForm((p) => ({ ...p, low_stock_threshold: e.target.value }))}
            className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          <button
            type="submit"
            disabled={adding}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {adding ? "Adding…" : "Add Item"}
          </button>
        </div>
      </form>

      {/* ── Table ── */}
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">{search ? "No items match your search." : "No items yet."}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Item</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Type</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Stock</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Threshold</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                      (p.item_type || 'Product') === 'Product' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                    }`}>
                      {p.item_type || 'Product'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{p.stock}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-500">{p.low_stock_threshold}</td>
                  <td className="px-4 py-3">{stockBadge(p)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditTarget(p)}
                        className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(p)}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Edit Modal ── */}
      <EditModal
        isOpen={!!editTarget}
        title={`Edit Item — ${editTarget?.name ?? ""}`}
        fields={PRODUCT_FIELDS}
        initialValues={editTarget ? {
          name: editTarget.name,
          item_type: editTarget.item_type,
          stock: String(editTarget.stock),
          low_stock_threshold: String(editTarget.low_stock_threshold),
        } : {}}
        onSave={handleSave}
        onClose={() => setEditTarget(null)}
        saving={saving}
      />

      {/* ── Confirm Delete ── */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete Item"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  )
}

export default ProductList
