import { useEffect, useState } from "react"
import { fetchProducts } from "../api/inventoryApi"
import { findUnmappedComponents } from "../lib/shipmentConfig"

// Lists shipment-recipe components that match no inventory item (by item code
// or name). Renders nothing when everything maps.
export default function ComponentMappingWarning() {
  const [missing, setMissing] = useState([])

  useEffect(() => {
    let alive = true
    fetchProducts()
      .then((products) => { if (alive) setMissing(findUnmappedComponents(products)) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  if (missing.length === 0) return null

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <p className="font-semibold">
        {missing.length} shipment component{missing.length !== 1 ? "s" : ""} not found in inventory
      </p>
      <p className="mt-0.5 text-xs">
        Shipments that use {missing.length !== 1 ? "these" : "this"} will be blocked until the item exists with this
        name or its item code: <span className="font-medium">{missing.join(", ")}</span>
      </p>
    </div>
  )
}
