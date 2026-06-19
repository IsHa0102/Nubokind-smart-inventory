import { supabase } from "./supabaseClient"

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
async function resolveNamesToIds(items) {
  const { data, error } = await supabase.from("warehouse_products").select("id, name")
  if (error) throw new Error(error.message)
  const nameToId = {}
  data.forEach((p) => { nameToId[p.name.toLowerCase()] = p.id })
  return items.map(({ name, quantity }) => {
    const product_id = nameToId[name.toLowerCase()]
    if (!product_id) throw new Error(`Product "${name}" not found in inventory.`)
    return { product_id, quantity }
  })
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
      warehouse_manufacturers(name)
    `)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []).map((o) => ({
    ...o,
    product_name:  o.warehouse_products?.name  ?? "Unknown",
    supplier_name: o.warehouse_manufacturers?.name ?? null,
  }))
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

export const updatePurchaseOrderStatus = async (id, status, updateStock = false) => {
  const { data: order, error: fetchErr } = await supabase
    .from("purchase_orders")
    .select("product_id, quantity_ordered")
    .eq("id", id)
    .single()
  if (fetchErr) throw new Error(fetchErr.message)

  const { error } = await supabase
    .from("purchase_orders")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)

  if (updateStock && status === "received") {
    const { data: product, error: pErr } = await supabase
      .from("warehouse_products")
      .select("stock")
      .eq("id", order.product_id)
      .single()
    if (pErr) throw new Error(pErr.message)
    const { error: sErr } = await supabase
      .from("warehouse_products")
      .update({ stock: product.stock + order.quantity_ordered })
      .eq("id", order.product_id)
    if (sErr) throw new Error(sErr.message)
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

export const createPlannedShipment = async ({ destination, notes, lines }) => {
  const { data: shipment, error: shipErr } = await supabase
    .from("warehouse_planned_shipments")
    .insert({ destination, notes: notes || null })
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

export const deletePlannedShipment = async (id) => {
  const { error } = await supabase
    .from("warehouse_planned_shipments")
    .delete()
    .eq("id", id)
  if (error) throw new Error(error.message)
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
