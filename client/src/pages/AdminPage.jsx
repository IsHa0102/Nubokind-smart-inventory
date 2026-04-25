import { useEffect, useState } from "react"
import {
  createDestination,
  createManufacturer,
  createProduct,
  fetchDestinations,
  fetchManufacturers,
  fetchProducts,
} from "../api/inventoryApi"

function AdminPage() {
  const [products, setProducts] = useState([])
  const [manufacturers, setManufacturers] = useState([])
  const [destinations, setDestinations] = useState([])
  const [productForm, setProductForm] = useState({ name: "", stock: "", low_stock_threshold: "" })
  const [manufacturerName, setManufacturerName] = useState("")
  const [destinationName, setDestinationName] = useState("")

  const loadData = async () => {
    const [p, m, d] = await Promise.all([fetchProducts(), fetchManufacturers(), fetchDestinations()])
    setProducts(p)
    setManufacturers(m)
    setDestinations(d)
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleCreateProduct = async (event) => {
    event.preventDefault()
    await createProduct({
      ...productForm,
      stock: Number(productForm.stock),
      low_stock_threshold: Number(productForm.low_stock_threshold),
    })
    setProductForm({ name: "", stock: "", low_stock_threshold: "" })
    loadData()
  }

  const handleCreateManufacturer = async (event) => {
    event.preventDefault()
    await createManufacturer({ name: manufacturerName })
    setManufacturerName("")
    loadData()
  }

  const handleCreateDestination = async (event) => {
    event.preventDefault()
    await createDestination({ name: destinationName })
    setDestinationName("")
    loadData()
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">Admin</h2>

      <div className="grid gap-6 lg:grid-cols-3">
        <form onSubmit={handleCreateProduct} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold">Add Product</h3>
          <input
            required
            placeholder="Product name"
            value={productForm.name}
            onChange={(event) => setProductForm((prev) => ({ ...prev, name: event.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <input
            required
            type="number"
            min="0"
            placeholder="Stock"
            value={productForm.stock}
            onChange={(event) => setProductForm((prev) => ({ ...prev, stock: event.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <input
            required
            type="number"
            min="0"
            placeholder="Low stock threshold"
            value={productForm.low_stock_threshold}
            onChange={(event) => setProductForm((prev) => ({ ...prev, low_stock_threshold: event.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Add Product</button>
          <p className="text-xs text-slate-500">Current products: {products.length}</p>
        </form>

        <form onSubmit={handleCreateManufacturer} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold">Manage Manufacturers</h3>
          <input
            required
            placeholder="Manufacturer name"
            value={manufacturerName}
            onChange={(event) => setManufacturerName(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Add Manufacturer</button>
          <ul className="list-disc pl-5 text-sm text-slate-600">
            {manufacturers.map((item) => (
              <li key={item.id}>{item.name}</li>
            ))}
          </ul>
        </form>

        <form onSubmit={handleCreateDestination} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold">Manage Destinations</h3>
          <input
            required
            placeholder="Destination name"
            value={destinationName}
            onChange={(event) => setDestinationName(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Add Destination</button>
          <ul className="list-disc pl-5 text-sm text-slate-600">
            {destinations.map((item) => (
              <li key={item.id}>{item.name}</li>
            ))}
          </ul>
        </form>
      </div>
    </div>
  )
}

export default AdminPage
