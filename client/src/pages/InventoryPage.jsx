import { useEffect, useState } from "react"
import { fetchProducts, updateProductCost } from "../api/inventoryApi"

function getStatus(product) {
  if (product.stock <= 0) return "Out of Stock"
  if (product.stock <= product.low_stock_threshold) return "Low Stock"
  return "Healthy"
}

const statusStyles = {
  "Healthy":      "bg-emerald-100 text-emerald-700",
  "Low Stock":    "bg-amber-100 text-amber-700",
  "Out of Stock": "bg-rose-100 text-rose-700",
}

function packagingOrder(name) {
  if (name.toLowerCase().includes("thank you card")) return 0
  if (name.toLowerCase().includes("sleeve"))         return 1
  if (name.toLowerCase() === "potli")                return 2
  if (name.toLowerCase().includes("box"))            return 3
  return 4
}

function InventoryTable({ items, emptyText, costs, onCostChange, onCostBlur }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50">
          <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3">Item</th>
            <th className="px-4 py-3">Stock</th>
            <th className="px-4 py-3">Low Stock Threshold</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Cost (₹)</th>
            <th className="px-4 py-3 text-right">Total Cost (₹)</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td className="px-4 py-8 text-center text-slate-400" colSpan="6">{emptyText}</td>
            </tr>
          ) : (
            items.map((product) => {
              const status = getStatus(product)
              const cost   = Number(costs[product.id] ?? 0)
              const stock  = product.stock ?? 0
              const total  = cost > 0 && stock > 0 ? cost * stock : null
              return (
                <tr key={product.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{product.name}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-700">{stock}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-500">{product.low_stock_threshold}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[status]}`}>
                      {status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min="0"
                      value={costs[product.id] ?? ""}
                      onChange={(e) => onCostChange(product.id, e.target.value)}
                      onBlur={() => onCostBlur(product.id)}
                      placeholder="e.g. 120"
                      className="w-28 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-700">
                    {total !== null
                      ? `₹${total.toLocaleString("en-IN")}`
                      : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

function InventoryPage() {
  const [products, setProducts] = useState([])
  const [costs, setCosts] = useState({})

  useEffect(() => {
    fetchProducts().then((data) => {
      setProducts(data)
      const c = {}
      data.forEach((p) => { c[p.id] = p.cost ?? "" })
      setCosts(c)
    })
  }, [])

  const handleCostChange = (id, val) => {
    setCosts((prev) => ({ ...prev, [id]: val }))
  }

  const saveCost = async (id) => {
    const cost = costs[id] === "" ? null : Number(costs[id])
    try { await updateProductCost(id, cost) } catch (e) { console.error(e) }
  }

  const productItems = products.filter((p) => p.item_type !== "Packaging")
  const packagingItems = products
    .filter((p) => p.item_type === "Packaging")
    .sort((a, b) => packagingOrder(a.name) - packagingOrder(b.name))

  const calcTotal = (items) => items.reduce((sum, p) => {
    const cost = Number(costs[p.id] ?? 0)
    return sum + (cost > 0 && (p.stock ?? 0) > 0 ? cost * p.stock : 0)
  }, 0)

  const grandTotal = calcTotal(productItems) + calcTotal(packagingItems)

  const downloadCSV = () => {
    const today = new Date().toISOString().split("T")[0]
    const header = ["Item", "Item Type", "Stock", "Low Stock Threshold", "Status", "Cost (INR)", "Total Cost (INR)"]
    const csvRows = [...productItems, ...packagingItems].map((p) => {
      const cost  = Number(costs[p.id] ?? 0)
      const total = cost > 0 && (p.stock ?? 0) > 0 ? cost * p.stock : ""
      return [`"${p.name}"`, `"${p.item_type || ""}"`, p.stock ?? 0, p.low_stock_threshold ?? 0, `"${getStatus(p)}"`, cost || "", total]
    })
    const csv = [header, ...csvRows].map((r) => r.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href = url; a.download = `inventory_${today}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Inventory</h2>
        <button
          onClick={downloadCSV}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download CSV
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-slate-800">Products</h3>
          <span className="text-xs font-medium text-slate-400">{productItems.length} items</span>
        </div>
        <InventoryTable
          items={productItems}
          emptyText="No products yet."
          costs={costs}
          onCostChange={handleCostChange}
          onCostBlur={saveCost}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-slate-800">Packaging Items</h3>
          <span className="text-xs font-medium text-slate-400">{packagingItems.length} items</span>
        </div>
        <InventoryTable
          items={packagingItems}
          emptyText="No packaging items yet."
          costs={costs}
          onCostChange={handleCostChange}
          onCostBlur={saveCost}
        />
      </div>

      <div className="flex justify-end">
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-6 py-4 min-w-[280px]">
          <p className="text-sm text-indigo-600 font-medium">Total Inventory Cost (Products + Packaging)</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-indigo-800">
            {grandTotal > 0 ? `₹${grandTotal.toLocaleString("en-IN")}` : "—"}
          </p>
        </div>
      </div>
    </div>
  )
}

export default InventoryPage
