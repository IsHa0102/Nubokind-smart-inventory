import { useEffect, useState } from "react"
import { fetchDestinations, fetchManufacturers, fetchMasterSheet, fetchProducts, upsertMasterSheetRow } from "../api/inventoryApi"
import DestinationList from "../components/DestinationList"
import ManufacturerList from "../components/ManufacturerList"
import ProductList from "../components/ProductList"
import { ToastContainer, useToasts } from "../components/Toast"

// ── Auth gate ──────────────────────────────────────────────────────────────
function AdminLogin({ onSuccess }) {
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const correct = import.meta.env.VITE_ADMIN_PASSWORD
      if (password === correct) {
        localStorage.setItem("isAdminAuthenticated", "true")
        onSuccess()
      } else {
        setError("Incorrect password.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100">
            <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900">Admin Access</h2>
          <p className="mt-1 text-sm text-slate-500">Enter the admin password to continue</p>
        </div>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 pr-10 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              tabIndex={-1}
            >
              {showPassword ? (
                // Eye-off icon
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                // Eye icon
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
          >
            {loading ? "Verifying..." : "Unlock Admin"}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Master Sheet ───────────────────────────────────────────────────────────
const MASTER_PRODUCTS = [
  { name: "Ele Teether Blue Green",       code: "TE-EL-BL-GR-2" },
  { name: "Ele Teether Green Grey",       code: "TE-EL-GR-GY-2" },
  { name: "Ele Teether Beige Pink",       code: "TE-EL-BE-PI-2" },
  { name: "Ele Teether Beige Blue",       code: "TE-EL-BE-BL-2" },
  { name: "Ele Teether Blue Pink",        code: "TE-EL-BL-PI-2" },
  { name: "Ele Teether Beige Green",      code: "TE-EL-BE-GR-2" },
  { name: "Ele Teether Green Pink",       code: "TE-EL-GR-PI-2" },
  { name: "Kiko Teether Green",           code: "TE-KI-GR-1"    },
  { name: "Kiko Teether White",           code: "TE-KI-WH-1"    },
  { name: "Kiko Teether Blue",            code: "TE-KI-BL-1"    },
  { name: "Ball Teether Yellow",          code: "TE-BA-YE-1"    },
  { name: "Ball Teether Blue",            code: "TE-BA-BL-1"    },
  { name: "High Contrast Bookset",        code: "BO-HC-3"        },
  { name: "High Contrast Sensory Kit",    code: "SK-HC-3"        },
  { name: "High Contrast Flashcard Kit",  code: "FK-HC-2"        },
]

function MasterSheet({ addToast }) {
  const [rows, setRows] = useState(() =>
    MASTER_PRODUCTS.map((p) => ({ ...p, sellingPrice: "", stock: "" }))
  )

  useEffect(() => {
    fetchMasterSheet()
      .then((data) => {
        const map = {}
        data.forEach((r) => { map[r.product_code] = r })
        setRows(MASTER_PRODUCTS.map((p) => ({
          ...p,
          sellingPrice: map[p.code]?.selling_price ?? "",
          stock:        map[p.code]?.stock         ?? "",
        })))
      })
      .catch(() => {})
  }, [])

  const updateRow = (code, field, value) => {
    setRows((prev) => prev.map((r) => r.code === code ? { ...r, [field]: value } : r))
  }

  const saveRow = async (row) => {
    const price = row.sellingPrice === "" ? null : Number(row.sellingPrice)
    const stock = row.stock        === "" ? null : Number(row.stock)
    try {
      await upsertMasterSheetRow(row.code, price, stock)
    } catch {
      addToast("error", `Failed to save ${row.name}`)
    }
  }

  const totalInventoryCost = rows.reduce((sum, r) => {
    const p = Number(r.sellingPrice)
    const s = Number(r.stock)
    return sum + (p > 0 && s > 0 ? p * s : 0)
  }, 0)

  const downloadCSV = () => {
    const header = ["Master Product Name", "Master Product ID", "Selling Price", "Stock", "Total Cost"]
    const csvRows = rows.map((r) => {
      const p = Number(r.sellingPrice)
      const s = Number(r.stock)
      const total = p > 0 && s > 0 ? p * s : ""
      return [
        `"${r.name}"`, `"${r.code}"`,
        r.sellingPrice === "" ? "" : r.sellingPrice,
        r.stock        === "" ? "" : r.stock,
        total,
      ]
    })
    const csv = [header, ...csvRows].map((r) => r.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href     = url
    a.download = `master_sheet_${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Master Sheet</h3>
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
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 text-left">Master Product Name</th>
              <th className="px-4 py-3 text-left">Master Product ID</th>
              <th className="px-4 py-3 text-left">Selling Price (₹)</th>
              <th className="px-4 py-3 text-left">Stock</th>
              <th className="px-4 py-3 text-right">Total Cost (₹)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.code} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-900">{row.name}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{row.code}</td>
                <td className="px-4 py-2.5">
                  <input
                    type="number"
                    min="0"
                    value={row.sellingPrice}
                    onChange={(e) => updateRow(row.code, "sellingPrice", e.target.value)}
                    onBlur={() => saveRow(row)}
                    placeholder="e.g. 499"
                    className="w-28 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </td>
                <td className="px-4 py-2.5">
                  <input
                    type="number"
                    min="0"
                    value={row.stock}
                    onChange={(e) => updateRow(row.code, "stock", e.target.value)}
                    onBlur={() => saveRow(row)}
                    placeholder="e.g. 50"
                    className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium text-slate-700">
                  {Number(row.sellingPrice) > 0 && Number(row.stock) > 0
                    ? `₹${(Number(row.sellingPrice) * Number(row.stock)).toLocaleString("en-IN")}`
                    : <span className="text-slate-300">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50">
              <td className="px-4 py-3 text-sm font-semibold text-slate-700" colSpan="4">
                Total Inventory Cost
              </td>
              <td className="px-4 py-3 text-right text-sm font-bold text-indigo-700 tabular-nums">
                {totalInventoryCost > 0
                  ? `₹${totalInventoryCost.toLocaleString("en-IN")}`
                  : <span className="font-normal text-slate-400">—</span>}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}


// ── Admin page ─────────────────────────────────────────────────────────────
function AdminContent() {
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

  useEffect(() => { loadData() }, [])

  const handleLogout = () => {
    localStorage.removeItem("isAdminAuthenticated")
    window.location.reload()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Admin</h2>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Logout
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Items</h3>
            <span className="text-xs font-medium text-slate-500">{products.length} total</span>
          </div>
          <input placeholder="Search products…" value={productSearch} onChange={(e) => setProductSearch(e.target.value)}
            className="mb-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
          <ProductList products={products} onRefresh={loadData} addToast={addToast} search={productSearch} />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Manufacturers</h3>
            <span className="text-xs font-medium text-slate-500">{manufacturers.length} total</span>
          </div>
          <input placeholder="Search manufacturers…" value={mfrSearch} onChange={(e) => setMfrSearch(e.target.value)}
            className="mb-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
          <ManufacturerList manufacturers={manufacturers} onRefresh={loadData} addToast={addToast} search={mfrSearch} />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Destinations</h3>
            <span className="text-xs font-medium text-slate-500">{destinations.length} total</span>
          </div>
          <input placeholder="Search destinations…" value={destSearch} onChange={(e) => setDestSearch(e.target.value)}
            className="mb-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
          <DestinationList destinations={destinations} onRefresh={loadData} addToast={addToast} search={destSearch} />
        </div>
      </div>
      <MasterSheet addToast={addToast} />
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  )
}

function AdminPage() {
  const [authenticated, setAuthenticated] = useState(
    () => localStorage.getItem("isAdminAuthenticated") === "true"
  )

  if (!authenticated) {
    return <AdminLogin onSuccess={() => setAuthenticated(true)} />
  }
  return <AdminContent />
}

export default AdminPage
