import { useEffect, useState } from "react"
import { fetchProducts } from "../api/inventoryApi"

function getStatus(product) {
  if (product.stock <= 0) return "Out of Stock"
  if (product.stock <= product.low_stock_threshold) return "Low Stock"
  return "Healthy"
}

function InventoryPage() {
  const [products, setProducts] = useState([])

  useEffect(() => {
    fetchProducts().then(setProducts)
  }, [])

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">Inventory</h2>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3">Low Stock Threshold</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-900">{product.name}</td>
                <td className="px-4 py-3">{product.stock}</td>
                <td className="px-4 py-3">{product.low_stock_threshold}</td>
                <td className="px-4 py-3">{getStatus(product)}</td>
              </tr>
            ))}
            {products.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan="4">
                  No products yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default InventoryPage
