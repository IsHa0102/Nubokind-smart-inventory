import { useCallback, useEffect, useMemo, useState } from "react"
import {
  fetchProducts, updateProductCost, runDueDispatches,
  fetchSheetReconciliation, recordSheetCounts,
} from "../api/inventoryApi"
import { SHIPMENT_PRODUCTS, buildLineDeductions, makeStockLookup } from "../lib/shipmentConfig"
import { buildSyncPlan, fetchSheetRows, sheetCountsFromPlan } from "../lib/sheetSync"
import SheetReconcileModal from "../components/SheetReconcileModal"

// Sheet column cell: the sheet count, and how it compares with system stock at
// the count date (see SheetReconcileModal / sql/005).
function SheetCells({ r, onReview }) {
  if (!r) {
    return (
      <>
        <td className="px-4 py-3 text-slate-300">—</td>
        <td className="px-4 py-3 text-slate-300">—</td>
      </>
    )
  }
  let diffCell
  if (r.superseded) {
    diffCell = <span className="text-xs text-slate-400" title="Recounted in the app after the sheet count — the newer recount is used">Recounted since</span>
  } else if (r.diff === 0) {
    diffCell = <span className="text-xs font-medium text-emerald-600">✓ Match</span>
  } else if (r.sheet_status === "accepted") {
    diffCell = <span className="text-xs font-medium text-slate-500" title={`Sheet differed by ${r.diff}; stock was set to the sheet`}>✓ Synced</span>
  } else if (r.sheet_status === "ignored") {
    diffCell = <span className="text-xs text-slate-400" title="Reviewed — system number kept">{r.diff > 0 ? `+${r.diff}` : r.diff} kept</span>
  } else {
    diffCell = (
      <button
        onClick={onReview}
        title="System stock differs from the sheet count — review"
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
          r.diff > 0 ? "bg-amber-100 text-amber-800 hover:bg-amber-200" : "bg-rose-100 text-rose-700 hover:bg-rose-200"}`}
      >
        ⚑ {r.diff > 0 ? `+${r.diff}` : r.diff}
      </button>
    )
  }
  return (
    <>
      <td className="px-4 py-3 tabular-nums text-slate-700">
        {r.sheet_stock}
        {r.sheet_count_label && <span className="ml-1 text-[10px] text-slate-400">{r.sheet_count_label}</span>}
      </td>
      <td className="px-4 py-3">{diffCell}</td>
    </>
  )
}

function getStatus(product) {
  if (product.stock < 0) return "Short"
  if (product.stock <= 0) return "Out of Stock"
  if (product.stock <= product.low_stock_threshold) return "Low Stock"
  return "Healthy"
}

const statusStyles = {
  "Healthy":      "bg-emerald-100 text-emerald-700",
  "Low Stock":    "bg-amber-100 text-amber-700",
  "Out of Stock": "bg-rose-100 text-rose-700",
  "Short":        "bg-rose-600 text-white",
}

function packagingOrder(name) {
  if (name.toLowerCase().includes("thank you card")) return 0
  if (name.toLowerCase().includes("sleeve"))         return 1
  if (name.toLowerCase() === "potli")                return 2
  if (name.toLowerCase().includes("box"))            return 3
  return 4
}

function InventoryTable({ items, emptyText, costs, onCostChange, onCostBlur, recon, onReview }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50">
          <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3">Item</th>
            <th className="px-4 py-3">Item ID</th>
            <th className="px-4 py-3" title="Calculated from every entry and consignment logged in the app">System Stock</th>
            <th className="px-4 py-3" title="Latest count in the warehouse Google Sheet">Sheet Stock</th>
            <th className="px-4 py-3" title="Sheet count vs system stock on the count date">Diff</th>
            <th className="px-4 py-3">Low Stock Threshold</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Cost (₹)</th>
            <th className="px-4 py-3 text-right">Total Cost (₹)</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td className="px-4 py-8 text-center text-slate-400" colSpan="9">{emptyText}</td>
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
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{product.item_code ?? <span className="text-slate-200">—</span>}</td>
                  <td className={`px-4 py-3 tabular-nums font-semibold ${stock < 0 ? "text-rose-600" : "text-slate-800"}`}>{stock}</td>
                  <SheetCells r={recon[product.id]} onReview={onReview} />
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
  const [fgCounts, setFgCounts] = useState(() => {
    try { return JSON.parse(localStorage.getItem("nubo_fg_counts") || "{}") }
    catch { return {} }
  })

  const handleFgChange = (key, val) => {
    const updated = { ...fgCounts, [key]: val }
    setFgCounts(updated)
    localStorage.setItem("nubo_fg_counts", JSON.stringify(updated))
  }

  const [reviewOpen, setReviewOpen] = useState(false)
  const [recon, setRecon] = useState({})       // product_id → sheet reconciliation row
  const [sheetPlan, setSheetPlan] = useState(null)
  const [sheetState, setSheetState] = useState({ status: "idle", error: "" }) // idle | syncing | ok | error

  const loadProducts = useCallback(async () => {
    const [data, rec] = await Promise.all([
      fetchProducts(),
      fetchSheetReconciliation().catch((e) => { console.warn(e.message); return {} }),
    ])
    setProducts(data)
    setRecon(rec)
    const c = {}
    data.forEach((p) => { c[p.id] = p.cost ?? "" })
    setCosts(c)
    return data
  }, [])

  // Pull the latest count from the warehouse sheet and store it beside system
  // stock. Never changes stock — differences are reviewed and confirmed.
  const syncSheet = useCallback(async (currentProducts) => {
    setSheetState({ status: "syncing", error: "" })
    try {
      const rows = await fetchSheetRows()
      const plan = buildSyncPlan(rows, currentProducts)
      await recordSheetCounts(sheetCountsFromPlan(plan))
      setSheetPlan(plan)
      setRecon(await fetchSheetReconciliation())
      setSheetState({ status: "ok", error: "" })
    } catch (e) {
      setSheetState({ status: "error", error: e.message || String(e) })
    }
  }, [])

  useEffect(() => {
    // Due scheduled consignments first, so System Stock already reflects them.
    runDueDispatches()
      .then(loadProducts)
      .then(syncSheet)
      .catch((e) => setSheetState({ status: "error", error: `Couldn't load inventory: ${e.message}` }))
  }, [loadProducts, syncSheet])

  const openDiffs = products.filter((p) => recon[p.id] && recon[p.id].diff !== 0 && recon[p.id].sheet_status === "open")
  const lastSynced = Object.values(recon).map((r) => r.sheet_synced_at).filter(Boolean).sort().pop()
  const countLabel = Object.values(recon).find((r) => r.sheet_count_label)?.sheet_count_label

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

  const buildableSkus = useMemo(() => {
    const stockOf = makeStockLookup(products)

    const rows = []
    for (const sp of SHIPMENT_PRODUCTS) {
      const variantList = sp.variants ?? [null]
      for (const variant of variantList) {
        const rowKey = `${sp.key}__${variant?.key ?? "none"}`
        const fg = Math.max(0, Number(fgCounts[rowKey] ?? 0))
        const components = buildLineDeductions(sp.key, variant?.key ?? null, 1)
        if (components.length === 0) continue
        let limitingName = ""
        let limitingCount = Infinity
        for (const c of components) {
          const effectiveStock = Math.max(0, stockOf(c.name) - fg * c.quantity)
          const canMake = Math.floor(effectiveStock / c.quantity)
          if (canMake < limitingCount) { limitingCount = canMake; limitingName = c.name }
        }
        const buildable = limitingCount === Infinity ? 0 : limitingCount
        rows.push({
          rowKey,
          productLabel: sp.label,
          variantLabel: variant?.label ?? null,
          masterId: variant?.masterId ?? sp.masterId ?? null,
          buildable,
          limitingComponent: buildable === 0 ? limitingName : null,
        })
      }
    }
    return rows
  }, [products, fgCounts])

  const downloadCSV = () => {
    const today = new Date().toISOString().split("T")[0]
    const header = ["Item", "Item Type", "System Stock", "Sheet Stock", "Sheet Count", "Diff", "Low Stock Threshold", "Status", "Cost (INR)", "Total Cost (INR)"]
    const csvRows = [...productItems, ...packagingItems].map((p) => {
      const cost  = Number(costs[p.id] ?? 0)
      const total = cost > 0 && (p.stock ?? 0) > 0 ? cost * p.stock : ""
      const r = recon[p.id]
      return [`"${p.name}"`, `"${p.item_type || ""}"`, p.stock ?? 0, r?.sheet_stock ?? "", `"${r?.sheet_count_label ?? ""}"`, r?.diff ?? "",
        p.low_stock_threshold ?? 0, `"${getStatus(p)}"`, cost || "", total]
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
        <div className="flex items-center gap-2">
        <button
          onClick={() => syncSheet(products)}
          disabled={sheetState.status === "syncing"}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          <svg className={`h-3.5 w-3.5 ${sheetState.status === "syncing" ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {sheetState.status === "syncing" ? "Syncing sheet…" : "Sync Sheet"}
        </button>
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
      </div>

      {sheetState.status === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn't read the warehouse sheet: {sheetState.error}
          {lastSynced && <> Showing the count stored on {new Date(lastSynced).toLocaleString("en-IN")}.</>}
        </div>
      )}

      {openDiffs.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>
            ⚑ <span className="font-semibold">{openDiffs.length} item{openDiffs.length !== 1 ? "s" : ""}</span> differ from the
            warehouse sheet{countLabel ? ` (${countLabel} count)` : ""}. Check and confirm which number is right.
          </span>
          <button onClick={() => setReviewOpen(true)} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">
            Review differences
          </button>
        </div>
      ) : Object.keys(recon).length > 0 && (
        <p className="text-xs text-slate-500">
          ✓ System stock agrees with the warehouse sheet{countLabel ? ` (${countLabel} count)` : ""}
          {lastSynced && <> · synced {new Date(lastSynced).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</>}
          {" · "}<button onClick={() => setReviewOpen(true)} className="text-indigo-600 hover:underline">details</button>
        </p>
      )}

      <SheetReconcileModal
        isOpen={reviewOpen}
        onClose={() => setReviewOpen(false)}
        products={products}
        recon={recon}
        plan={sheetPlan}
        onResolved={loadProducts}
      />

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
          recon={recon}
          onReview={() => setReviewOpen(true)}
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
          recon={recon}
          onReview={() => setReviewOpen(true)}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-slate-800">Buildable SKUs</h3>
          <span className="text-xs font-medium text-slate-400">from current raw stock</span>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50">
              <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Master ID</th>
                <th className="px-4 py-3 text-right">Current FG</th>
                <th className="px-4 py-3 text-right">Can Build</th>
                <th className="px-4 py-3">Bottleneck</th>
              </tr>
            </thead>
            <tbody>
              {buildableSkus.map((row, i) => {
                const qty = row.buildable
                const qtyColor = qty === 0
                  ? "text-rose-600 font-bold"
                  : qty <= 10
                  ? "text-amber-600 font-semibold"
                  : "text-emerald-600 font-semibold"
                const badge = qty === 0
                  ? "bg-rose-100 text-rose-700"
                  : qty <= 10
                  ? "bg-amber-100 text-amber-700"
                  : "bg-emerald-100 text-emerald-700"
                return (
                  <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-slate-900">{row.productLabel}</p>
                      {row.variantLabel && (
                        <p className="text-xs text-slate-400 mt-0.5">{row.variantLabel}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-slate-500">
                      {row.masterId ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <input
                        type="number"
                        min="0"
                        value={fgCounts[row.rowKey] ?? ""}
                        onChange={(e) => handleFgChange(row.rowKey, e.target.value)}
                        placeholder="0"
                        className="w-20 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-sm text-right tabular-nums focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-sm tabular-nums ${badge}`}>
                        {qty}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      {row.limitingComponent
                        ? <span className="text-rose-500">{row.limitingComponent}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
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
