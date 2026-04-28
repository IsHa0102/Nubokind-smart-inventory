import { useEffect, useState } from "react"
import { fetchDestinations, fetchManufacturers, fetchProducts } from "../api/inventoryApi"
import DestinationList from "../components/DestinationList"
import ManufacturerList from "../components/ManufacturerList"
import ProductList from "../components/ProductList"
import { ToastContainer, useToasts } from "../components/Toast"

function AdminPage() {
  const [products, setProducts] = useState([])
  const [manufacturers, setManufacturers] = useState([])
  const [destinations, setDestinations] = useState([])

  const [productSearch, setProductSearch] = useState("")
  const [mfrSearch, setMfrSearch] = useState("")
  const [destSearch, setDestSearch] = useState("")

  const { toasts, addToast, removeToast } = useToasts()

  const loadData = async () => {
    const [p, m, d] = await Promise.all([fetchProducts(), fetchManufacturers(), fetchDestinations()])
    setProducts(p)
    setManufacturers(m)
    setDestinations(d)
  }

  useEffect(() => {
    loadData()
  }, [])

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">Admin</h2>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── Products ── */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Products</h3>
            <span className="text-xs font-medium text-slate-500">{products.length} total</span>
          </div>
          <input
            placeholder="Search products…"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            className="mb-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          <ProductList products={products} onRefresh={loadData} addToast={addToast} search={productSearch} />
        </div>

        {/* ── Manufacturers ── */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Manufacturers</h3>
            <span className="text-xs font-medium text-slate-500">{manufacturers.length} total</span>
          </div>
          <input
            placeholder="Search manufacturers…"
            value={mfrSearch}
            onChange={(e) => setMfrSearch(e.target.value)}
            className="mb-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          <ManufacturerList manufacturers={manufacturers} onRefresh={loadData} addToast={addToast} search={mfrSearch} />
        </div>

        {/* ── Destinations ── */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Destinations</h3>
            <span className="text-xs font-medium text-slate-500">{destinations.length} total</span>
          </div>
          <input
            placeholder="Search destinations…"
            value={destSearch}
            onChange={(e) => setDestSearch(e.target.value)}
            className="mb-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          <DestinationList destinations={destinations} onRefresh={loadData} addToast={addToast} search={destSearch} />
        </div>
      </div>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  )
}

export default AdminPage

