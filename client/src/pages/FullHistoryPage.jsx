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
  return `${entry.quantity}`
}

const getMovementLabel = (entry) => {
  if (entry.type === "add") return `Added from ${entry.source || "Unknown source"}`
  if (entry.type === "remove") return `Sent to ${entry.destination || "Unknown destination"}`
  return "Adjusted"
}

function FullHistoryPage() {
  const [products, setProducts] = useState([])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({})
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 })
  const [filters, setFilters] = useState({
    productId: "",
    type: "",
    from: "",
    to: "",
    page: 1,
    limit: 10,
  })

  useEffect(() => {
    fetchProducts().then(setProducts)
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const payload = {
          page: filters.page,
          limit: filters.limit,
        }
        if (filters.productId) payload.productId = filters.productId
        if (filters.type) payload.type = filters.type
        if (filters.from) payload.from = filters.from
        if (filters.to) payload.to = filters.to

        const response = await fetchInventoryEntries(payload)
        setEntries(response.items || [])
        setMeta({
          total: response.total || 0,
          page: response.page || 1,
          limit: response.limit || 10,
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

  const toggleExpanded = (id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">Inventory History</h2>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
        <select
          value={filters.productId}
          onChange={(event) => updateFilter("productId", event.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All products</option>
          {products.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>

        <select
          value={filters.type}
          onChange={(event) => updateFilter("type", event.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All types</option>
          <option value="add">Add</option>
          <option value="remove">Remove</option>
          <option value="adjustment">Adjustment</option>
        </select>

        <input
          type="date"
          value={filters.from}
          onChange={(event) => updateFilter("from", event.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />

        <input
          type="date"
          value={filters.to}
          onChange={(event) => updateFilter("to", event.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {loading ? <p className="py-6 text-sm text-slate-500">Loading history...</p> : null}
        {!loading && !hasEntries ? <p className="py-6 text-sm text-slate-500">No recent activity</p> : null}

        {!loading && hasEntries ? (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-slate-200 p-3">
                <button
                  type="button"
                  onClick={() => toggleExpanded(entry.id)}
                  className="grid w-full gap-2 text-left md:grid-cols-5"
                >
                  <p className="text-sm font-semibold text-slate-900">{getSignedQuantity(entry)}</p>
                  <p className="text-sm font-medium text-slate-900">{entry.product_name}</p>
                  <p className="text-sm text-slate-600">{getMovementLabel(entry)}</p>
                  <p className="text-sm text-slate-500">{entry.type}</p>
                  <p className="text-sm text-slate-500">{formatDate(entry.created_at)}</p>
                </button>

                {expanded[entry.id] ? (
                  <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-sm text-slate-600">
                    <p>
                      <span className="font-medium text-slate-700">Remarks: </span>
                      {entry.remarks || "No remarks"}
                    </p>
                    <div>
                      <p className="mb-1 font-medium text-slate-700">Images</p>
                      {entry.images?.length ? (
                        <div className="flex flex-wrap gap-2">
                          {entry.images.map((imageName, idx) => (
                            <span key={`${entry.id}-${idx}`} className="rounded bg-slate-100 px-2 py-1 text-xs">
                              {imageName}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p>No images</p>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
          <p className="text-sm text-slate-500">
            Showing page {meta.page} of {meta.totalPages} ({meta.total} entries)
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={meta.page <= 1}
              onClick={() => setFilters((prev) => ({ ...prev, page: prev.page - 1 }))}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={meta.page >= meta.totalPages}
              onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

export default FullHistoryPage
