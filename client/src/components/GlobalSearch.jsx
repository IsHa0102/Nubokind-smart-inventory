import { useEffect, useMemo, useRef, useState } from "react"
import { fetchProducts } from "../api/inventoryApi"
import { SHIPMENT_PRODUCTS, buildLineDeductions } from "../lib/shipmentConfig"

function getStatus(stock, threshold) {
  if (stock <= 0) return "Out of Stock"
  if (stock <= threshold) return "Low Stock"
  return "Healthy"
}

const statusStyles = {
  "Healthy":      "bg-emerald-100 text-emerald-700",
  "Low Stock":    "bg-amber-100 text-amber-700",
  "Out of Stock": "bg-rose-100 text-rose-700",
}

export function GlobalSearch() {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [products, setProducts] = useState([])
  const [loaded, setLoaded] = useState(false)
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open && !loaded) {
      fetchProducts().then((data) => { setProducts(data); setLoaded(true) })
    }
  }, [open, loaded])

  useEffect(() => {
    function onMouseDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [])

  const q = query.trim().toLowerCase()

  const rawResults = useMemo(() => {
    if (!q || !loaded) return []
    return products
      .filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.item_code && p.item_code.toLowerCase().includes(q))
      )
      .slice(0, 8)
  }, [q, products, loaded])

  const skuResults = useMemo(() => {
    if (!q) return []
    let fgCounts = {}
    try { fgCounts = JSON.parse(localStorage.getItem("nubo_fg_counts") || "{}") } catch {}

    const nameToStock = {}
    products.forEach((p) => { nameToStock[p.name] = p.stock ?? 0 })

    const rows = []
    for (const sp of SHIPMENT_PRODUCTS) {
      const variantList = sp.variants ?? [null]
      for (const variant of variantList) {
        const label = variant ? `${sp.label} — ${variant.label}` : sp.label
        const masterId = variant?.masterId ?? sp.masterId ?? null
        const matches =
          label.toLowerCase().includes(q) ||
          (masterId && masterId.toLowerCase().includes(q))
        if (!matches) continue

        const rowKey = `${sp.key}__${variant?.key ?? "none"}`
        const fg = Math.max(0, Number(fgCounts[rowKey] ?? 0))
        const components = buildLineDeductions(sp.key, variant?.key ?? null, 1)
        let buildable = 0
        if (components.length > 0) {
          let limiting = Infinity
          for (const c of components) {
            const eff = Math.max(0, (nameToStock[c.name] ?? 0) - fg * c.quantity)
            const can = Math.floor(eff / c.quantity)
            if (can < limiting) limiting = can
          }
          buildable = limiting === Infinity ? 0 : limiting
        }
        rows.push({ label, masterId, rowKey, buildable, currentFg: fg })
      }
    }
    return rows.slice(0, 8)
  }, [q, products])

  const hasResults = rawResults.length > 0 || skuResults.length > 0
  const showDropdown = open && q.length > 0

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search items or SKUs..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-8 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(""); inputRef.current?.focus() }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute left-0 top-full z-50 mt-1.5 max-h-[480px] w-full min-w-[340px] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl sm:w-[440px]">
          {!loaded && (
            <p className="px-4 py-3 text-sm text-slate-400">Loading...</p>
          )}
          {loaded && !hasResults && (
            <p className="px-4 py-3 text-sm text-slate-400">No results for "{query}"</p>
          )}

          {rawResults.length > 0 && (
            <div>
              <p className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Raw Items &amp; Packaging
              </p>
              {rawResults.map((p) => {
                const status = getStatus(p.stock, p.low_stock_threshold)
                return (
                  <div key={p.id} className="flex items-center gap-3 border-b border-slate-50 px-4 py-2.5 hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">{p.name}</p>
                      <p className="font-mono text-xs text-slate-400">{p.item_code ?? "—"}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular-nums text-sm font-semibold text-slate-700">{p.stock ?? 0}</p>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${statusStyles[status]}`}>
                        {status}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {skuResults.length > 0 && (
            <div>
              <p className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Finished SKUs
              </p>
              {skuResults.map((sku) => {
                const buildColor = sku.buildable === 0
                  ? "text-rose-600"
                  : sku.buildable <= 10
                  ? "text-amber-600"
                  : "text-emerald-600"
                return (
                  <div key={sku.rowKey} className="flex items-center gap-3 border-b border-slate-50 px-4 py-2.5 hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">{sku.label}</p>
                      <p className="font-mono text-xs text-slate-400">{sku.masterId ?? "—"}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`tabular-nums text-sm font-semibold ${buildColor}`}>
                        Can build: {sku.buildable}
                      </p>
                      <p className="tabular-nums text-xs text-slate-400">
                        Current FG: {sku.currentFg}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
