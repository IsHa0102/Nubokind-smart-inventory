import { supabase } from "./supabaseClient"
import { buildAllDeductions, makeComponentResolver } from "../lib/shipmentConfig"

const BUCKET = "inventory-images"

// ── Image upload ───────────────────────────────────────────────────────────
async function uploadImage(file) {
  const ext = file.name.split(".").pop()
  const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, file, { contentType: file.type, upsert: false })
  if (error) throw new Error(`Image upload failed: ${error.message}`)
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename)
  return data.publicUrl
}

async function uploadImages(files = []) {
  const urls = []
  for (const file of files) urls.push(await uploadImage(file))
  return urls
}

// ── Products ───────────────────────────────────────────────────────────────
export const fetchProducts = async () => {
  const { data, error } = await supabase
    .from("warehouse_products")
    .select("*")
    .order("id", { ascending: false })
  if (error) throw new Error(error.message)
  return data
}

export const createProduct = async ({ name, stock, low_stock_threshold, item_type }) => {
  const { data, error } = await supabase
    .from("warehouse_products")
    .insert({ name, stock: Number(stock), low_stock_threshold: Number(low_stock_threshold), item_type })
    .select()
    .single()
  if (error) {
    if (error.code === "23505") throw new Error("A product with this name already exists.")
    throw new Error(error.message)
  }
  return data
}

export const updateProductCost = async (id, cost) => {
  const { error } = await supabase
    .from("warehouse_products")
    .update({ cost })
    .eq("id", id)
  if (error) throw new Error(error.message)
}

export const updateProduct = async (id, payload) => {
  const { data, error } = await supabase
    .from("warehouse_products")
    .update(payload)
    .eq("id", id)
    .select()
    .single()
  if (error) {
    if (error.code === "23505") throw new Error("A product with this name already exists.")
    throw new Error(error.message)
  }
  return data
}

export const deleteProduct = async (id) => {
  const { count } = await supabase
    .from("warehouse_entries")
    .select("id", { count: "exact", head: true })
    .eq("product_id", id)
  if (count > 0) throw new Error(`Cannot delete — this product has ${count} inventory entries.`)
  const { error } = await supabase.from("warehouse_products").delete().eq("id", id)
  if (error) throw new Error(error.message)
}

// ── Manufacturers ──────────────────────────────────────────────────────────
export const fetchManufacturers = async () => {
  const { data, error } = await supabase
    .from("warehouse_manufacturers")
    .select("*")
    .order("name", { ascending: true })
  if (error) throw new Error(error.message)
  return data
}

export const createManufacturer = async ({ name }) => {
  const { data, error } = await supabase
    .from("warehouse_manufacturers")
    .insert({ name })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export const updateManufacturer = async (id, { name }) => {
  const { data, error } = await supabase
    .from("warehouse_manufacturers")
    .update({ name })
    .eq("id", id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export const deleteManufacturer = async (id) => {
  const { data: mfr } = await supabase.from("warehouse_manufacturers").select("name").eq("id", id).single()
  if (!mfr) throw new Error("Manufacturer not found.")
  const { count } = await supabase
    .from("warehouse_entries")
    .select("id", { count: "exact", head: true })
    .eq("source", mfr.name)
  if (count > 0) throw new Error(`Cannot delete "${mfr.name}" — it is referenced in ${count} inventory entry/entries.`)
  const { error } = await supabase.from("warehouse_manufacturers").delete().eq("id", id)
  if (error) throw new Error(error.message)
}

// ── Destinations ───────────────────────────────────────────────────────────
export const fetchDestinations = async () => {
  const { data, error } = await supabase
    .from("warehouse_destinations")
    .select("*")
    .order("name", { ascending: true })
  if (error) throw new Error(error.message)
  return data
}

export const createDestination = async ({ name }) => {
  const { data, error } = await supabase
    .from("warehouse_destinations")
    .insert({ name })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export const updateDestination = async (id, { name }) => {
  const { data, error } = await supabase
    .from("warehouse_destinations")
    .update({ name })
    .eq("id", id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export const deleteDestination = async (id) => {
  const { data: dest } = await supabase.from("warehouse_destinations").select("name").eq("id", id).single()
  if (!dest) throw new Error("Destination not found.")
  const { count } = await supabase
    .from("warehouse_entries")
    .select("id", { count: "exact", head: true })
    .eq("destination", dest.name)
  if (count > 0) throw new Error(`Cannot delete "${dest.name}" — it is referenced in ${count} inventory entry/entries.`)
  const { error } = await supabase.from("warehouse_destinations").delete().eq("id", id)
  if (error) throw new Error(error.message)
}

// ── Inventory entries ──────────────────────────────────────────────────────
export const fetchInventoryEntries = async (params = {}) => {
  const { page = 1, limit = 25, productId, type, from, to } = params
  const offset = (page - 1) * limit

  let query = supabase
    .from("warehouse_entries")
    .select("*, warehouse_products(name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (productId) query = query.eq("product_id", productId)
  if (type) query = query.eq("type", type)
  if (from) query = query.gte("created_at", from)
  if (to) query = query.lte("created_at", `${to}T23:59:59+00:00`)

  const { data, error, count } = await query
  if (error) throw new Error(error.message)

  const items = (data || []).map((e) => ({ ...e, product_name: e.warehouse_products?.name }))
  const total = count || 0
  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.max(Math.ceil(total / limit), 1),
  }
}

export const fetchRecentInventoryEntries = async (limit = 7) => {
  return fetchInventoryEntries({ page: 1, limit })
}

export const deleteInventoryEntry = async (id) => {
  const { error } = await supabase.rpc("warehouse_delete_entry", { p_entry_id: id })
  if (error) throw new Error(error.message)
}

export const createInventoryEntry = async (formData) => {
  const product_id = formData.get("product_id")
  const type = formData.get("type")
  const quantity = formData.get("quantity")
  const source = formData.get("source") || null
  const destination = formData.get("destination") || null
  const remarks = formData.get("remarks") || null
  const entry_date = formData.get("entry_date") || null
  const imageFiles = formData.getAll("images")

  const imageUrls = await uploadImages(imageFiles)

  const { data, error } = await supabase.rpc("warehouse_single_entry", {
    p_product_id: Number(product_id),
    p_type: type,
    p_quantity: Number(quantity),
    p_source: source,
    p_destination: destination,
    p_remarks: remarks,
    p_entry_date: entry_date,
    p_image_urls: imageUrls,
  })
  if (error) throw new Error(error.message)
  return data
}

// ── Name → ID resolution helper ───────────────────────────────────────────
// Resolves by warehouse item_code first, then by name (see shipmentConfig), so
// renaming an item in Admin doesn't break shipments. Reports every missing item
// in one message instead of stopping at the first.
async function resolveNamesToIds(items) {
  const { data, error } = await supabase.from("warehouse_products").select("id, name, item_code")
  if (error) throw new Error(error.message)
  const resolve = makeComponentResolver(data || [])
  const missing = []
  const resolved = items.map(({ name, quantity }) => {
    const product = resolve(name)
    if (!product) missing.push(name)
    return { product_id: product?.id, quantity }
  })
  if (missing.length) {
    throw new Error(
      `Not found in inventory: ${missing.join(", ")}. ` +
      "Check the item name / item code in Admin → Products."
    )
  }
  return resolved
}

// ── Bulk operations ────────────────────────────────────────────────────────
export const bulkRemoveInventory = async ({ deductions, destination, remarks, images = [], entry_date }) => {
  const [imageUrls, dedWithIds] = await Promise.all([
    uploadImages(images),
    resolveNamesToIds(deductions),
  ])
  const { data, error } = await supabase.rpc("bulk_remove_by_id", {
    p_deductions: dedWithIds,
    p_destination: destination,
    p_remarks: remarks || null,
    p_entry_date: entry_date || null,
    p_image_urls: imageUrls,
  })
  if (error) throw new Error(error.message)
  return data
}

export const bulkAddInventory = async ({ additions, source, remarks, images = [], entry_date }) => {
  const [imageUrls, addWithIds] = await Promise.all([
    uploadImages(images),
    resolveNamesToIds(additions),
  ])
  const { data, error } = await supabase.rpc("bulk_add_by_id", {
    p_additions: addWithIds,
    p_source: source,
    p_remarks: remarks || null,
    p_entry_date: entry_date || null,
    p_image_urls: imageUrls,
  })
  if (error) throw new Error(error.message)
  return data
}

// ── Dashboard ──────────────────────────────────────────────────────────────
export const fetchDashboardStats = async () => {
  const { data, error } = await supabase.rpc("get_dashboard_stats")
  if (error) throw new Error(error.message)
  return data
}

export const fetchStockMovement = async () => {
  const { data, error } = await supabase.rpc("get_stock_movement")
  if (error) throw new Error(error.message)
  return data
}

// ── Master Sheet ───────────────────────────────────────────────────────────
export const fetchMasterSheet = async () => {
  const { data, error } = await supabase.from("warehouse_master_sheet").select("*")
  if (error) throw new Error(error.message)
  return data || []
}

export const upsertMasterSheetRow = async (product_code, selling_price, stock) => {
  const { error } = await supabase
    .from("warehouse_master_sheet")
    .upsert(
      { product_code, selling_price, stock, updated_at: new Date().toISOString() },
      { onConflict: "product_code" }
    )
  if (error) throw new Error(error.message)
}

// ── Purchase Orders ────────────────────────────────────────────────────────
export const fetchPurchaseOrders = async () => {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(`
      *,
      warehouse_products(name),
      warehouse_manufacturers(name),
      purchase_order_receipts(id, quantity, received_on, notes, created_at)
    `)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []).map((o) => {
    const received = o.quantity_received ?? 0
    const receipts = [...(o.purchase_order_receipts ?? [])].sort((a, b) =>
      a.received_on === b.received_on
        ? a.created_at.localeCompare(b.created_at)
        : a.received_on.localeCompare(b.received_on))
    return {
      ...o,
      product_name:  o.warehouse_products?.name  ?? "Unknown",
      supplier_name: o.warehouse_manufacturers?.name ?? null,
      quantity_received: received,
      // Still to come. A closed order has nothing to come, even if it closed short.
      remaining: o.status === "received" ? 0 : Math.max(o.quantity_ordered - received, 0),
      receipts,
    }
  })
}

export const createPurchaseOrder = async (payload) => {
  const { data, error } = await supabase
    .from("purchase_orders")
    .insert(payload)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

// Record one delivery against a PO (sql/004). The database function records the
// receipt, moves quantity_received, closes the order when it is complete and
// adds the units to stock through warehouse_single_entry — all in one
// transaction, so the delivery shows in History with before/after stock and can
// never be half-written. `close` = the supplier will send nothing more; with
// quantity 0 it closes the order short without a delivery.
export const receivePurchaseOrder = async (id, { quantity, receivedOn = null, notes = null, close = false }) => {
  const { data, error } = await supabase.rpc("receive_purchase_order", {
    p_order_id: Number(id),
    p_quantity: Number(quantity),
    p_received_on: receivedOn || null,
    p_notes: notes || null,
    p_close: !!close,
  })
  if (error) throw new Error(error.message)
  return data
}

// Ordered <-> In Transit only. Receiving always goes through
// receivePurchaseOrder(), the one path that adds stock.
export const updatePurchaseOrderStatus = async (id, status) => {
  if (status === "received") throw new Error("Use Receive to record a delivery.")
  const { error } = await supabase
    .from("purchase_orders")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)
}

// Edit any field of a purchase order.
//
// Units already received are in warehouse_products.stock, so:
//   - a closed order locks component, quantity and status (there is no
//     un-receive); supplier, dates and notes stay editable — they touch no stock
//   - an open order with deliveries locks the component (its stock went to that
//     product) and cannot have its quantity cut below what already arrived
// Moving an open order to "received" here receives everything still to come,
// exactly as Receive with the full remaining quantity would.
export const updatePurchaseOrder = async (id, fields) => {
  const { data: existing, error: fetchErr } = await supabase
    .from("purchase_orders")
    .select("status, quantity_received")
    .eq("id", id)
    .single()
  if (fetchErr) throw new Error(fetchErr.message)

  const wasReceived = existing.status === "received"
  const alreadyIn = existing.quantity_received ?? 0
  if (!wasReceived && fields.quantity_ordered < alreadyIn) {
    throw new Error(`${alreadyIn} units have already arrived — the order can't be less than that.`)
  }

  const common = {
    supplier_id: fields.supplier_id,
    order_date: fields.order_date,
    expected_delivery_date: fields.expected_delivery_date,
    notes: fields.notes,
  }
  const patch = wasReceived
    ? common
    : {
        ...common,
        ...(alreadyIn > 0 ? {} : { product_id: fields.product_id }),
        quantity_ordered: fields.quantity_ordered,
        // "received" is never written here — receive_purchase_order() sets it.
        ...(fields.status === "received" ? {} : { status: fields.status }),
      }

  const { data: updated, error } = await supabase
    .from("purchase_orders")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("quantity_ordered, quantity_received")
    .single()
  if (error) throw new Error(error.message)

  if (!wasReceived && fields.status === "received") {
    const rest = updated.quantity_ordered - updated.quantity_received
    await receivePurchaseOrder(id, { quantity: Math.max(rest, 0), close: true })
  }
}

export const deletePurchaseOrder = async (id) => {
  const { error } = await supabase.from("purchase_orders").delete().eq("id", id)
  if (error) throw new Error(error.message)
}

// ── Planned Shipments ──────────────────────────────────────────────────────
export const fetchPlannedShipments = async () => {
  const { data, error } = await supabase
    .from("warehouse_planned_shipments")
    .select("*, warehouse_planned_shipment_lines(*)")
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

export const createPlannedShipment = async ({ destination, notes, planned_date, lines }) => {
  const { data: shipment, error: shipErr } = await supabase
    .from("warehouse_planned_shipments")
    .insert({ destination, notes: notes || null, planned_date: planned_date || null })
    .select()
    .single()
  if (shipErr) throw new Error(shipErr.message)

  if (lines && lines.length > 0) {
    const { error: linesErr } = await supabase
      .from("warehouse_planned_shipment_lines")
      .insert(lines.map((l) => ({ ...l, shipment_id: shipment.id })))
    if (linesErr) throw new Error(linesErr.message)
  }

  return shipment
}

export const updatePlannedShipmentStatus = async (id, status) => {
  const { error } = await supabase
    .from("warehouse_planned_shipments")
    .update({ status })
    .eq("id", id)
  if (error) throw new Error(error.message)
}

export const updatePlannedShipment = async (id, { destination, notes, planned_date, lines }) => {
  const { error: updErr } = await supabase
    .from("warehouse_planned_shipments")
    .update({ destination, notes: notes || null, planned_date: planned_date || null })
    .eq("id", id)
  if (updErr) throw new Error(updErr.message)

  const { error: delErr } = await supabase
    .from("warehouse_planned_shipment_lines")
    .delete()
    .eq("shipment_id", id)
  if (delErr) throw new Error(delErr.message)

  if (lines && lines.length > 0) {
    const { error: insErr } = await supabase
      .from("warehouse_planned_shipment_lines")
      .insert(lines.map((l) => ({ sku_key: l.sku_key, variant_key: l.variant_key, quantity: l.quantity, label: l.label, shipment_id: id })))
    if (insErr) throw new Error(insErr.message)
  }
}

export const deletePlannedShipment = async (id) => {
  const { error } = await supabase
    .from("warehouse_planned_shipments")
    .delete()
    .eq("id", id)
  if (error) throw new Error(error.message)
}

// ── Consignments ────────────────────────────────────────────────────────────
// A consignment is a warehouse_planned_shipments row with status "dispatched".
// The RPC deducts components, links each History entry to the consignment and,
// on edit, writes only the difference. id = null creates a new one; the id of a
// planned order dispatches it; the id of a dispatched one edits it.
//
// lines: [{ sku_key, variant_key, quantity, label }]
export const saveConsignment = async ({
  id = null, destination, dispatch_date, reference, notes, corrugation_boxes, lines, images = [],
}) => {
  const components = buildAllDeductions(
    lines.map((l) => ({ productKey: l.sku_key, variantKey: l.variant_key, qty: l.quantity }))
  )
  const corr = Number(corrugation_boxes) || 0
  if (corr > 0) components.push({ name: "Corrugation Box", quantity: corr })

  const [imageUrls, deductions] = await Promise.all([
    uploadImages(images),
    resolveNamesToIds(components),
  ])

  const { data, error } = await supabase.rpc("warehouse_save_consignment", {
    p_id: id,
    p_destination: destination,
    p_dispatch_date: dispatch_date || null,
    p_reference: reference || null,
    p_notes: notes || null,
    p_corrugation_boxes: corr,
    p_lines: lines.map((l) => ({
      sku_key: l.sku_key, variant_key: l.variant_key || null, quantity: Number(l.quantity), label: l.label,
    })),
    p_deductions: deductions,
    p_image_urls: imageUrls,
  })
  if (error) throw new Error(error.message)
  return data
}

// Dispatched → stock returned and record kept as "cancelled". Never-shipped plan → deleted.
export const cancelConsignment = async (id) => {
  const { data, error } = await supabase.rpc("warehouse_cancel_consignment", { p_id: id })
  if (error) throw new Error(error.message)
  return data
}

// Set an exact stock number and log it in History as a Recount.
export const setProductStock = async (id, newStock, remarks) => {
  const { data, error } = await supabase.rpc("warehouse_set_stock", {
    p_product_id: id,
    p_new_stock: Number(newStock),
    p_remarks: remarks || null,
  })
  if (error) throw new Error(error.message)
  return data
}

// Non-recount movements (add / remove / shipment) logged on or after a date.
// Used by the sheet sync to warn when a count is older than recent activity.
// Returns { [product_id]: number_of_movements }.
export const fetchMovementCountsSince = async (productIds, sinceIso) => {
  if (!productIds.length) return {}
  const { data, error } = await supabase
    .from("warehouse_entries")
    .select("product_id")
    .in("product_id", productIds)
    .neq("type", "adjustment")
    .gte("created_at", sinceIso)
  if (error) throw new Error(error.message)
  const counts = {}
  for (const { product_id } of data || []) counts[product_id] = (counts[product_id] || 0) + 1
  return counts
}

// ── Reports ────────────────────────────────────────────────────────────────
export const fetchReportStats = async (params = {}) => {
  const { from, to, itemType } = params
  const today = new Date().toISOString().split("T")[0]
  const daysAgo30 = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0]
  const { data, error } = await supabase.rpc("warehouse_report_stats", {
    p_from: from || daysAgo30,
    p_to: to || today,
    p_item_type: itemType || null,
  })
  if (error) throw new Error(error.message)
  return data
}
