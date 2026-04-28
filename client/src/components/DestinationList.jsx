import { useState } from "react"
import { createDestination, deleteDestination, updateDestination } from "../api/inventoryApi"
import ConfirmModal from "./ConfirmModal"
import EditModal from "./EditModal"

const NAME_FIELDS = [{ key: "name", label: "Destination Name", type: "text", required: true }]

function DestinationList({ destinations, onRefresh, addToast, search }) {
  const [newName, setNewName] = useState("")
  const [adding, setAdding] = useState(false)

  const [editTarget, setEditTarget] = useState(null)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const filtered = search
    ? destinations.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()))
    : destinations

  // ── Add ────────────────────────────────────────────────────
  const handleAdd = async (e) => {
    e.preventDefault()
    setAdding(true)
    try {
      await createDestination({ name: newName })
      setNewName("")
      onRefresh()
      addToast("Destination added successfully", "success")
    } catch (err) {
      addToast(err?.response?.data?.message || "Failed to add destination", "error")
    } finally {
      setAdding(false)
    }
  }

  // ── Edit ───────────────────────────────────────────────────
  const handleSave = async (values) => {
    setSaving(true)
    try {
      await updateDestination(editTarget.id, { name: values.name })
      setEditTarget(null)
      onRefresh()
      addToast("Destination updated successfully", "success")
    } catch (err) {
      addToast(err?.response?.data?.message || "Failed to update destination", "error")
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ─────────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteDestination(deleteTarget.id)
      setDeleteTarget(null)
      onRefresh()
      addToast("Destination deleted successfully", "success")
    } catch (err) {
      setDeleteTarget(null)
      addToast(err?.response?.data?.message || "Failed to delete destination", "error")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      {/* ── Add form ── */}
      <form onSubmit={handleAdd} className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Add New Destination</p>
        <div className="flex gap-2">
          <input
            required
            placeholder="Destination name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          <button
            type="submit"
            disabled={adding}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {adding ? "Adding…" : "Add"}
          </button>
        </div>
      </form>

      {/* ── List ── */}
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">
          {search ? "No destinations match your search." : "No destinations yet."}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden">
          {filtered.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
            >
              {/* Icon */}
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </span>

              <span className="flex-1 text-sm font-medium text-slate-800">{d.name}</span>

              <div className="flex gap-2">
                <button
                  onClick={() => setEditTarget(d)}
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => setDeleteTarget(d)}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ── Edit Modal ── */}
      <EditModal
        isOpen={!!editTarget}
        title={`Edit Destination — ${editTarget?.name ?? ""}`}
        fields={NAME_FIELDS}
        initialValues={editTarget ? { name: editTarget.name } : {}}
        onSave={handleSave}
        onClose={() => setEditTarget(null)}
        saving={saving}
      />

      {/* ── Confirm Delete ── */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete Destination"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  )
}

export default DestinationList

