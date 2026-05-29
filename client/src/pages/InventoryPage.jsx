import { useEffect, useState } from "react"
import { fetchProducts } from "../api/inventoryApi"

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

function InventoryTable({ products, emptyText }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-700">
          <tr>
            <th className="px-4 py-3 font-semibold">Item</th>
            <th className="px-4 py-3 font-semibold">Stock</th>
            <th className="px-4 py-3 font-semibold">Low Stock Threshold</th>
            <th className="px-4 py-3 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {products.length === 0 ? (
            <tr>
              <td className="px-4 py-8 text-center text-slate-400" colSpan="4">
                {emptyText}
              </td>
            </tr>
          ) : (
            products.map((product) => {
              const status = getStatus(product)
              return (
                <tr key={product.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{product.name}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-700">{product.stock}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-500">{product.low_stock_threshold}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[status]}`}>
                      {status}
                    </span>
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

  useEffect(() => {
    fetchProducts().then(setProducts)
  }, [])

  const productItems   = products.filter((p) => p.item_type !== "Packaging")

  function packagingOrder(name) {
    if (name.toLowerCase().includes("thank you card")) return 0
    if (name.toLowerCase().includes("sleeve"))         return 1
    if (name.toLowerCase() === "potli")                return 2
    if (name.toLowerCase().includes("box"))            return 3
    return 4
  }

  const packagingItems = products
    .filter((p) => p.item_type === "Packaging")
    .sort((a, b) => packagingOrder(a.name) - packagingOrder(b.name))

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-slate-900">Inventory</h2>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-slate-800">Products</h3>
          <span className="text-xs font-medium text-slate-400">{productItems.length} items</span>
        </div>
        <InventoryTable products={productItems} emptyText="No products yet." />
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-slate-800">Packaging Items</h3>
          <span className="text-xs font-medium text-slate-400">{packagingItems.length} items</span>
        </div>
        <InventoryTable products={packagingItems} emptyText="No packaging items yet." />
      </div>
    </div>
  )
}

export default InventoryPage
