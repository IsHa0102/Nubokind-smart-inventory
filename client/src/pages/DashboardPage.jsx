import { useEffect, useState } from "react"
import MetricCard from "../components/MetricCard"
import MovementChart from "../components/MovementChart"
import { fetchDashboardStats, fetchStockMovement } from "../api/inventoryApi"

function DashboardPage() {
  const [stats, setStats] = useState(null)
  const [movement, setMovement] = useState([])

  useEffect(() => {
    const load = async () => {
      const [statsRes, movementRes] = await Promise.all([fetchDashboardStats(), fetchStockMovement()])
      setStats(statsRes)
      setMovement(movementRes)
    }
    load()
  }, [])

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Total Stock" value={stats?.totalStock ?? 0} />
        <MetricCard title="Low Stock" value={stats?.lowStockCount ?? 0} />
        <MetricCard title="Out of Stock" value={stats?.outOfStockCount ?? 0} />
        <MetricCard
          title="Top Mover"
          value={stats?.topMover?.name || "N/A"}
          note={stats?.topMover?.movement ? `Qty moved: ${stats.topMover.movement}` : ""}
        />
      </div>

      <MovementChart data={movement} />
    </div>
  )
}

export default DashboardPage
