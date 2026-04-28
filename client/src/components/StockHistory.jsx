import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { fetchRecentInventoryEntries } from "../api/inventoryApi"

const typeStyleMap = {
  add: "text-emerald-700 bg-emerald-50",
  remove: "text-rose-700 bg-rose-50",
  adjustment: "text-amber-700 bg-amber-50",
}

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

function StockHistory() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({})
  const navigate = useNavigate()

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetchRecentInventoryEntries(7)
        setEntries(response.items || [])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const rows = useMemo(() => entries, [entries])

  const toggleExpanded = (id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Recent Stock Activity</h3>
        <button
          type="button"
          onClick={() => navigate("/inventory-history")}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          View All
        </button>
      </div>

      {loading ? <p className="py-6 text-sm text-slate-500">Loading recent activity...</p> : null}
      {!loading && rows.length === 0 ? <p className="py-6 text-sm text-slate-500">No recent activity</p> : null}

      {!loading && rows.length > 0 ? (
        <div className="space-y-3">
          {rows.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-slate-200 p-3">
              <button
                type="button"
                onClick={() => toggleExpanded(entry.id)}
                className="grid w-full gap-2 text-left md:grid-cols-4"
              >
                <div>
                  <p
                    className={`inline-flex rounded px-2 py-1 text-sm font-semibold ${typeStyleMap[entry.type] || ""}`}
                  >
                    {getSignedQuantity(entry)}
                  </p>
                </div>
                <p className="text-sm font-medium text-slate-900">{entry.product_name}</p>
                <p className="text-sm text-slate-600">{getMovementLabel(entry)}</p>
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
    </section>
  )
}

export default StockHistory
