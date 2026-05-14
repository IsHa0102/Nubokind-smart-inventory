import supabase from "../lib/supabase"

const BUCKET = "inventory-images"

// ── Image upload helper ───────────────────────────────────────────────────────
async function uploadImages(files = []) {
  const urls = []
  for (const file of files) {
    if (!file || file.size === 0) continue
    const ext = file.name.split(".").pop()
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(filename, file, { contentType: file.type, upsert: false })
    if (error) throw new Error(`Image upload failed: ${error.message}`)
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename)
    urls.push(data.publicUrl)
  }
  return urls
}

function throwIfError(error) {
  if (error) throw new Error(error.message || "Supabase error")
}

// ── Products ──────────────────────────────────────────────────────────────────
export const fetchProducts = async () => {
  const { data, error } = await supabase
    .from("warehouse_products")
    .select("*")
    .order("id", { ascending: false })
  throwIfError(error)
  return data
}

export const createProduct = async (payload) => {
  const { data, error } = await supabase
    .from("warehouse_products")
    .insert(payload)
    .select()
    .single()
  throwIfError(error)
  return data
}

export const updateProduct = async (id, payload) => {
  const { data, error } = await supabase
    .from("warehouse_products")
    .update(payload)
    .eq("id", id)
    .select()
    .single()
  throwIfError(error)
  return data
}

export const deleteProduct = async (id) => {
  const { error } = await supabase.from("warehouse_products").delete().eq("id", id)
  throwIfError(error)
}

// ── Manufacturers ─────────────────────────────────────────────────────────────
export const fetchManufacturers = async () => {
  const { data, error } = await supabase
    .from("warehouse_manufacturers")
    .select("*")
    .order("name")
  throwIfError(error)
  return data
}

export const createManufacturer = async (payload) => {
  const { data, error } = await supabase
    .from("warehouse_manufacturers")
    .insert(payload)
    .select()
    .single()
  throwIfError(error)
  return data
}

export const updateManufacturer = async (id, payload) => {
  const { data, error } = await supabase
    .from("warehouse_manufacturers")
    .update(payload)
    .eq("id", id)
    .select()
    .single()
  throwIfError(error)
  return data
}

export const deleteManufacturer = async (id) => {
  const { error } = await supabase.from("warehouse_manufacturers").delete().eq("id", id)
  throwIfError(error)
}

// ── Destinations ──────────────────────────────────────────────────────────────
export const fetchDestinations = async () => {
  const { data, error } = await supabase
    .from("warehouse_destinations")
    .select("*")
    .order("name")
  throwIfError(error)
  return data
}

export const createDestination = async (payload) => {
  const { data, error } = await supabase
    .from("warehouse_destinations")
    .insert(payload)
    .select()
    .single()
  throwIfError(error)
  return data
}

export const updateDestination = async (id, payload) => {
  const { data, error } = await supabase
    .from("warehouse_destinations")
    .update(payload)
    .eq("id", id)
    .select()
    .single()
  throwIfError(error)
  return data
}

export const deleteDestination = async (id) => {
  const { error } = await supabase.from("warehouse_destinations").delete().eq("id", id)
  throwIfError(error)
}

// ── Inventory Entries ─────────────────────────────────────────────────────────
export const fetchInventoryEntries = async (params = {}) => {
  const page  = Math.max(Number(params.page)  || 1,   1)
  const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 100)
  const from  = (page - 1) * limit
  const to    = from + limit - 1

  let q = supabase
    .from("warehouse_entries")
    .select("id, product_id, type, quantity, source, destination, remarks, images, created_at, warehouse_products(name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to)

  if (params.productId)                                        q = q.eq("product_id", Number(params.productId))
  if (params.type && ["add","remove","adjustment"].includes(params.type)) q = q.eq("type", params.type)
  if (params.from) q = q.gte("created_at", params.from)
  if (params.to)   q = q.lte("created_at", params.to + "T23:59:59")

  const { data, error, count } = await q
  throwIfError(error)

  // Flatten product name to match server response shape
  const items = (data || []).map((e) => ({
    ...e,
    product_name: e.warehouse_products?.name ?? `#${e.product_id}`,
    warehouse_products: undefined,
  }))

  const total      = count || 0
  const totalPages = Math.max(Math.ceil(total / limit), 1)
  return { items, total, page, limit, totalPages }
}

export const fetchRecentInventoryEntries = async (limit = 7) => {
  return fetchInventoryEntries({ page: 1, limit })
}

// ── Single Entry ──────────────────────────────────────────────────────────────
export const createInventoryEntry = async (formData) => {
  const files     = formData.getAll ? formData.getAll("images") : []
  const imageUrls = await uploadImages(files)

  const { data, error } = await supabase.rpc("warehouse_single_entry", {
    p_product_id:  Number(formData.get("product_id")),
    p_type:        formData.get("type"),
    p_quantity:    Number(formData.get("quantity")),
    p_source:      formData.get("source")      || null,
    p_destination: formData.get("destination") || null,
    p_remarks:     formData.get("remarks")     || null,
    p_entry_date:  formData.get("entry_date")  || null,
    p_image_urls:  imageUrls,
  })
  throwIfError(error)
  return data
}

// ── Delete Entry ──────────────────────────────────────────────────────────────
export const deleteInventoryEntry = async (id) => {
  // Grab image list before deleting so we can clean up storage
  const { data: entry } = await supabase
    .from("warehouse_entries")
    .select("images")
    .eq("id", id)
    .single()

  const { error } = await supabase.rpc("warehouse_delete_entry", { p_entry_id: id })
  throwIfError(error)

  // Best-effort image cleanup
  if (entry?.images?.length) {
    const filenames = entry.images.map((url) => url.split("/").pop())
    await supabase.storage.from(BUCKET).remove(filenames)
  }
}

// ── Bulk Remove ───────────────────────────────────────────────────────────────
export const bulkRemoveInventory = async ({ deductions, destination, remarks, images = [], entry_date }) => {
  const imageUrls = await uploadImages(images)
  const { data, error } = await supabase.rpc("warehouse_bulk_remove", {
    p_deductions:  deductions,
    p_destination: destination,
    p_remarks:     remarks     || null,
    p_entry_date:  entry_date  || null,
    p_image_urls:  imageUrls,
  })
  throwIfError(error)
  return data
}

// ── Bulk Add ──────────────────────────────────────────────────────────────────
export const bulkAddInventory = async ({ additions, source, remarks, images = [], entry_date }) => {
  const imageUrls = await uploadImages(images)
  const { data, error } = await supabase.rpc("warehouse_bulk_add", {
    p_additions:  additions,
    p_source:     source,
    p_remarks:    remarks    || null,
    p_entry_date: entry_date || null,
    p_image_urls: imageUrls,
  })
  throwIfError(error)
  return data
}

// ── Report Stats ──────────────────────────────────────────────────────────────
export const fetchReportStats = async (params = {}) => {
  const { data, error } = await supabase.rpc("warehouse_report_stats", {
    p_from:      params.from      || null,
    p_to:        params.to        || null,
    p_item_type: params.itemType  || null,
  })
  throwIfError(error)
  return data
}

// Stubs — dashboard page was removed, kept to avoid import errors
export const fetchDashboardStats = async () => ({ summary: {}, trend: [] })
export const fetchStockMovement  = async () => []
