import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { fetchRecentInventoryEntries } from "../api/inventoryApi"

const typeStyleMap = {
  add: "text-emerald-700 bg-emerald-50",
  remove: "text-rose-700 bg-rose-50",
  recount: "text-amber-700 bg-amber-50",
  adjustment: "text-amber-700 bg-amber-50",
}

const formatDate = (value) => {
  if (!value) return "N/A"
  const date = new Date(value)
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

const getSignedQuantity = (entry = {}) => {
  const qty = Number(entry.quantity) || 0
  if (entry.type === "add") return `+${qty}`
  if (entry.type === "remove") return `-${qty}`
  return `${qty}`
}

const getMovementLabel = (entry = {}) => {
  if (entry.type === "add") return `From: ${entry.source || "Unknown"}`
  if (entry.type === "remove") return `To: ${entry.destination || "Unknown"}`
  return "Recount/Adjustment"
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
        setEntries(response?.items || [])
      } catch (error) {
        console.error("Failed to load stock history:", error)
        setEntries([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const rows = useMemo(() => entries || [], [entries])

  const toggleExpanded = (id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Recent Stock Activity</h3>
        <button
          type="button"
          onClick={() => navigate("/inventory-history")}
          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:w-auto"
        >
          View All
        </button>
      </div>

      {loading ? (
        <p className="py-6 text-sm text-slate-500">Loading recent activity...</p>
      ) : null}
      {!loading && rows.length === 0 ? (
        <p className="py-6 text-sm text-slate-500">No recent activity</p>
      ) : null}

      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Date</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Item</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Type</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Qty</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Movement</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((entry, index) => (
                <tr key={entry?.id || index} className="hover:bg-slate-50">
                  <td className="px-3 py-2 text-sm text-slate-500">{formatDate(entry?.created_at)}</td>
                  <td className="px-3 py-2 font-medium text-slate-900 truncate max-w-[120px]">
                    {entry?.product_name || "Unknown"}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${typeStyleMap[entry?.type] || ""}`}>
                      {entry?.type === "add" ? "Add" : entry?.type === "remove" ? "Remove" : "Recount"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-900 tabular-nums">
                    {getSignedQuantity(entry)}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-600 max-w-[100px] truncate">
                    {getMovementLabel(entry)}
                  </td>
                  <td className="px-3 py-2 max-w-[150px]">
                    <span className="text-sm text-slate-600 truncate block">{entry?.remarks || "No remarks"}</span>
                    {entry?.images && entry.images.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1 text-xs text-slate-500">
                        {(entry.images || []).slice(0, 2).map((img, i) => (
                          <span key={i} className="bg-slate-100 rounded px-1">
                            {img}
                          </span>
                        ))}
                        {entry.images.length > 2 && (
                          <span>+{entry.images.length - 2} more</span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </section>
  )
}

export default StockHistory
