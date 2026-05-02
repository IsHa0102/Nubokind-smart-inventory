import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from "recharts"
import { fetchReportStats } from "../api/inventoryApi"

const fmt = (d) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })

const today = new Date().toISOString().split("T")[0]
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().split("T")[0]

function StatCard({ label, value, sub, color = "slate" }) {
  const colors = {
    slate:   "bg-white border-slate-200",
    red:     "bg-red-50 border-red-200",
    yellow:  "bg-amber-50 border-amber-200",
    green:   "bg-emerald-50 border-emerald-200",
    indigo:  "bg-indigo-50 border-indigo-200",
  }
  const textColors = {
    slate: "text-slate-900", red: "text-red-700", yellow: "text-amber-700",
    green: "text-emerald-700", indigo: "text-indigo-700",
  }
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${colors[color]}`}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${textColors[color]}`}>{value ?? "—"}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  )
}

function downloadCSV(topItems) {
  const headers = ["Item", "Type", "Current Stock", "Total Added", "Total Removed", "Avg Daily Usage", "Days Remaining"]
  const rows = topItems.map((i) => [
    i.name, i.item_type, i.current_stock, i.total_added, i.total_removed,
    i.avg_daily_usage, i.days_remaining ?? "N/A"
  ])
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url; a.download = "inventory_report.csv"; a.click()
  URL.revokeObjectURL(url)
}

export default function ReportsPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [preset, setPreset] = useState("30")
  const [from, setFrom] = useState(daysAgo(30))
  const [to, setTo] = useState(today)
  const [itemType, setItemType] = useState("")
  const [search, setSearch] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const result = await fetchReportStats({ from, to, itemType: itemType || undefined })
      setData(result)
    } catch {
      setError("Failed to load report data.")
    } finally {
      setLoading(false)
    }
  }, [from, to, itemType])

  useEffect(() => { load() }, [load])

  const handlePreset = (days) => {
    setPreset(days)
    setFrom(daysAgo(Number(days)))
    setTo(today)
  }

  const fastMover = useMemo(() => {
    if (!data?.topItems?.length) return null
    return data.topItems.reduce((a, b) => b.total_removed > a.total_removed ? b : a, data.topItems[0])
  }, [data])

  const slowMover = useMemo(() => {
    if (!data?.topItems?.length) return null
    const withMovement = data.topItems.filter((i) => i.total_removed > 0 || i.total_added > 0)
    if (!withMovement.length) return null
    return withMovement.reduce((a, b) =>
      (b.total_removed + b.total_added) < (a.total_removed + a.total_added) ? b : a, withMovement[0])
  }, [data])

  const filteredItems = useMemo(() => {
    if (!data?.topItems) return []
    return data.topItems.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
  }, [data, search])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-slate-900">Reports & Analytics</h2>
        {data && (
          <button onClick={() => downloadCSV(data.topItems)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-sm transition-colors">
            ↓ Export CSV
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        {["7", "30", "90"].map((d) => (
          <button key={d} onClick={() => handlePreset(d)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              preset === d ? "bg-indigo-600 text-white" : "border border-slate-200 text-slate-600 hover:border-indigo-300"
            }`}>
            Last {d} days
          </button>
        ))}
        <div className="flex items-center gap-2 ml-2">
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] text-slate-400">From</label>
            <input type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setPreset("custom") }}
              className="rounded border border-slate-300 px-2 py-1 text-xs" />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] text-slate-400">To</label>
            <input type="date" value={to} max={today} onChange={(e) => { setTo(e.target.value); setPreset("custom") }}
              className="rounded border border-slate-300 px-2 py-1 text-xs" />
          </div>
        </div>
        <select value={itemType} onChange={(e) => setItemType(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs ml-auto">
          <option value="">All types</option>
          <option value="Product">Product</option>
          <option value="Packaging">Packaging</option>
        </select>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {loading && <p className="text-sm text-slate-500">Loading report...</p>}

      {!loading && data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Total Stock" value={data.summary.total_stock.toLocaleString()} color="indigo" />
            <StatCard label="Low Stock" value={data.summary.low_stock} color="yellow" sub="below threshold" />
            <StatCard label="Out of Stock" value={data.summary.out_of_stock} color="red" />
            <StatCard label="Fast Mover" value={fastMover?.name ?? "—"}
              sub={fastMover ? `${fastMover.total_removed} removed` : ""} color="green" />
            <StatCard label="Slow Mover" value={slowMover?.name ?? "—"}
              sub={slowMover ? `${slowMover.total_removed + slowMover.total_added} movements` : ""} color="slate" />
          </div>

          {/* Movement trend chart */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-4 text-base font-semibold text-slate-800">Inventory Movement Trend</h3>
            {data.trend.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No movement data for this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={data.trend} margin={{ top: 4, right: 12, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradAdd" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradRem" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tickFormatter={fmt} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip labelFormatter={fmt} />
                  <Legend />
                  <Area type="monotone" dataKey="added" name="Added" stroke="#6366f1" fill="url(#gradAdd)" strokeWidth={2} />
                  <Area type="monotone" dataKey="removed" name="Removed" stroke="#f43f5e" fill="url(#gradRem)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Top items + forecast in two columns */}
          <div className="grid gap-4 lg:grid-cols-2">

            {/* Top moving items */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-slate-800">Top Moving Items</h3>
                <input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs w-28" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-2 py-2 text-left font-semibold text-slate-600">Item</th>
                      <th className="px-2 py-2 text-right font-semibold text-emerald-600">+Added</th>
                      <th className="px-2 py-2 text-right font-semibold text-rose-600">−Removed</th>
                      <th className="px-2 py-2 text-right font-semibold text-slate-600">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item, i) => (
                      <tr key={i} className={`border-b border-slate-100 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                        <td className="px-2 py-1.5 font-medium text-slate-800 max-w-[130px] truncate">{item.name}</td>
                        <td className="px-2 py-1.5 text-right text-emerald-600 tabular-nums">+{item.total_added}</td>
                        <td className="px-2 py-1.5 text-right text-rose-600 tabular-nums">−{item.total_removed}</td>
                        <td className={`px-2 py-1.5 text-right font-semibold tabular-nums ${
                          item.total_added - item.total_removed >= 0 ? "text-emerald-600" : "text-rose-600"
                        }`}>
                          {item.total_added - item.total_removed >= 0 ? "+" : ""}
                          {item.total_added - item.total_removed}
                        </td>
                      </tr>
                    ))}
                    {filteredItems.length === 0 && (
                      <tr><td colSpan={4} className="py-6 text-center text-slate-400">No items found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Low stock forecast */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-base font-semibold text-slate-800">Low Stock Forecast</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-2 py-2 text-left font-semibold text-slate-600">Item</th>
                      <th className="px-2 py-2 text-right font-semibold text-slate-600">Stock</th>
                      <th className="px-2 py-2 text-right font-semibold text-slate-600">Avg/day</th>
                      <th className="px-2 py-2 text-right font-semibold text-slate-600">Days left</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topItems
                      .filter((i) => i.avg_daily_usage > 0)
                      .sort((a, b) => (a.days_remaining ?? 9999) - (b.days_remaining ?? 9999))
                      .map((item, i) => {
                        const days = item.days_remaining
                        const rowColor = days === null ? "" : days <= 5 ? "bg-red-50" : days <= 15 ? "bg-amber-50" : ""
                        const daysColor = days === null ? "text-slate-400" : days <= 5 ? "text-red-600 font-bold" : days <= 15 ? "text-amber-600 font-semibold" : "text-emerald-600"
                        return (
                          <tr key={i} className={`border-b border-slate-100 ${rowColor}`}>
                            <td className="px-2 py-1.5 font-medium text-slate-800 max-w-[130px] truncate">{item.name}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{item.current_stock}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{item.avg_daily_usage}</td>
                            <td className={`px-2 py-1.5 text-right tabular-nums ${daysColor}`}>
                              {days === null ? "∞" : days}
                            </td>
                          </tr>
                        )
                      })}
                    {data.topItems.filter((i) => i.avg_daily_usage > 0).length === 0 && (
                      <tr><td colSpan={4} className="py-6 text-center text-slate-400">No usage data yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Bar chart - top 8 items by removal */}
          {filteredItems.some(i => i.total_removed > 0) && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-4 text-base font-semibold text-slate-800">Removal by Item</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={[...filteredItems].sort((a,b) => b.total_removed - a.total_removed).slice(0, 8)}
                  margin={{ top: 4, right: 12, left: -10, bottom: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="total_removed" name="Removed" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="total_added" name="Added" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}
