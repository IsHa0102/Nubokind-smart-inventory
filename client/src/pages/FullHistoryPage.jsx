import { useEffect, useMemo, useState } from "react"
import { fetchInventoryEntries, fetchProducts } from "../api/inventoryApi"

const formatDate = (value) => {
  const date = new Date(value)
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

const getSignedQuantity = (entry) => {
  if (entry.type === "add") return `+${entry.quantity}`
  if (entry.type === "remove") return `-${entry.quantity}`
  return `=${entry.quantity}`
}

// Simple lightbox for viewing uploaded images by filename
function ImageModal({ images, onClose }) {
  const [current, setCurrent] = useState(0)
  // Images are stored as filenames only (no URL available in this setup)
  // Show filename and a placeholder note
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative mx-4 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
        >
          ✕
        </button>
        <h3 className="mb-4 text-base font-semibold text-slate-800">
          Image {current + 1} of {images.length}
        </h3>
        <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
          <div>
            <div className="mb-3 text-4xl">🖼️</div>
            <p className="text-sm font-medium text-slate-700">{images[current]}</p>
            <p className="mt-2 text-xs text-slate-400">
              Images are stored on the server. To view, configure your server to serve uploaded files.
            </p>
          </div>
        </div>
        {images.length > 1 && (
          <div className="mt-4 flex justify-center gap-2">
            {images.map((img, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`rounded-lg border px-3 py-1 text-xs font-medium transition ${
                  i === current
                    ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}
        <div className="mt-4 space-y-1">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition ${
                i === current ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              <span className="text-base">📎</span>
              <span className="truncate">{img}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function FullHistoryPage() {
  const [products, setProducts] = useState([])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 25, totalPages: 1 })
  const [filters, setFilters] = useState({
    productId: "",
    type: "",
    from: "",
    to: "",
    page: 1,
    limit: 25,
  })
  const [lightboxImages, setLightboxImages] = useState(null)

  useEffect(() => {
    fetchProducts().then(setProducts)
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const payload = { page: filters.page, limit: filters.limit }
        if (filters.productId) payload.productId = filters.productId
        if (filters.type) payload.type = filters.type
        if (filters.from) payload.from = filters.from
        if (filters.to) payload.to = filters.to
        const response = await fetchInventoryEntries(payload)
        setEntries(response.items || [])
        setMeta({
          total: response.total || 0,
          page: response.page || 1,
          limit: response.limit || 25,
          totalPages: response.totalPages || 1,
        })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [filters])

  const hasEntries = useMemo(() => entries.length > 0, [entries])

  const updateFilter = (name, value) => {
    setFilters((prev) => ({ ...prev, [name]: value, page: 1 }))
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-900">Inventory History</h2>

      {/* ── Filters ── */}
      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-4">
        <select
          value={filters.productId}
          onChange={(e) => updateFilter("productId", e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All products</option>
          {products.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>

        <select
          value={filters.type}
          onChange={(e) => updateFilter("type", e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All types</option>
          <option value="add">Add</option>
          <option value="remove">Remove</option>
          <option value="adjustment">Recount</option>
        </select>

        {/* Fix 2: Date inputs with visible labels */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">From date</label>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => updateFilter("from", e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">To date</label>
          <input
            type="date"
            value={filters.to}
            onChange={(e) => updateFilter("to", e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* ── Table ── Fix 5: spreadsheet/compact style */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="px-4 py-6 text-sm text-slate-500">Loading history...</p>
        ) : !hasEntries ? (
          <p className="px-4 py-6 text-sm text-slate-500">No entries found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-100">
                  <th className="border-r border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 whitespace-nowrap">Date</th>
                  <th className="border-r border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 whitespace-nowrap">Item Name</th>
                  <th className="border-r border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 whitespace-nowrap">Type</th>
                  <th className="border-r border-slate-200 px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 whitespace-nowrap">Qty</th>
                  <th className="border-r border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 whitespace-nowrap">From</th>
                  <th className="border-r border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 whitespace-nowrap">To</th>
                  <th className="border-r border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 whitespace-nowrap">Remarks</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 whitespace-nowrap">Images</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, idx) => {
                  const typeLabel = entry.type === "add" ? "Add" : entry.type === "remove" ? "Remove" : "Recount"
                  const typeColor =
                    entry.type === "add"
                      ? "text-emerald-700 bg-emerald-50 border border-emerald-200"
                      : entry.type === "remove"
                      ? "text-rose-700 bg-rose-50 border border-rose-200"
                      : "text-amber-700 bg-amber-50 border border-amber-200"
                  const qty = getSignedQuantity(entry)
                  const rowBg = idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"
                  return (
                    <tr key={entry.id} className={`${rowBg} hover:bg-indigo-50/40 border-b border-slate-200 transition-colors`}>
                      <td className="border-r border-slate-200 px-3 py-1.5 text-xs text-slate-500 whitespace-nowrap tabular-nums">
                        {formatDate(entry.created_at)}
                      </td>
                      <td className="border-r border-slate-200 px-3 py-1.5 font-medium text-slate-900 whitespace-nowrap max-w-[140px] truncate">
                        {entry.product_name}
                      </td>
                      <td className="border-r border-slate-200 px-3 py-1.5">
                        <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-semibold ${typeColor}`}>
                          {typeLabel}
                        </span>
                      </td>
                      <td className="border-r border-slate-200 px-3 py-1.5 text-right tabular-nums font-semibold text-slate-800 whitespace-nowrap">
                        {qty}
                      </td>
                      <td className="border-r border-slate-200 px-3 py-1.5 text-xs text-slate-600 whitespace-nowrap">
                        {entry.source || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="border-r border-slate-200 px-3 py-1.5 text-xs text-slate-600 whitespace-nowrap">
                        {entry.destination || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="border-r border-slate-200 px-3 py-1.5 text-xs text-slate-600 max-w-[200px] truncate">
                        {entry.remarks || <span className="text-slate-300">—</span>}
                      </td>
                      {/* Fix 4: clickable image viewer */}
                      <td className="px-3 py-1.5">
                        {entry.images?.length > 0 ? (
                          <button
                            onClick={() => setLightboxImages(entry.images)}
                            className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-colors whitespace-nowrap"
                          >
                            <span>📎</span>
                            <span>{entry.images.length} file{entry.images.length > 1 ? "s" : ""}</span>
                          </button>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <p className="text-sm text-slate-500">
              Page {meta.page} of {meta.totalPages} &nbsp;·&nbsp; {meta.total} entries
            </p>
            <select
              value={filters.limit}
              onChange={(e) => setFilters((prev) => ({ ...prev, limit: Number(e.target.value), page: 1 }))}
              className="rounded border border-slate-300 px-2 py-1 text-xs"
            >
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={meta.page <= 1}
              onClick={() => setFilters((prev) => ({ ...prev, page: prev.page - 1 }))}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              ← Prev
            </button>
            <button
              type="button"
              disabled={meta.page >= meta.totalPages}
              onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next →
            </button>
          </div>
        </div>
      </section>

      {/* Fix 4: Image lightbox modal */}
      {lightboxImages && (
        <ImageModal images={lightboxImages} onClose={() => setLightboxImages(null)} />
      )}
    </div>
  )
}

export default FullHistoryPage
