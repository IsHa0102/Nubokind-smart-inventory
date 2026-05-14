const pool = require("../config/db")
const supabase = require("../config/supabase")
const { v4: uuidv4 } = require("crypto").randomUUID ? { v4: () => require("crypto").randomUUID() } : require("crypto")

const BUCKET = "inventory-images"

// Upload a single file buffer to Supabase Storage, return public URL
async function uploadToSupabase(file) {
  const ext = file.originalname.split(".").pop()
  const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    })

  if (error) throw new Error(`Supabase upload failed: ${error.message}`)

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename)
  return data.publicUrl
}

const getInventoryEntries = async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1)
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100)
    const offset = (page - 1) * limit
    const { productId, type, from, to } = req.query

    const where = []
    const values = []

    if (productId) {
      values.push(Number(productId))
      where.push(`ie.product_id = $${values.length}`)
    }
    if (type && ["add", "remove", "adjustment", "shipment"].includes(type)) {
      values.push(type)
      where.push(`ie.type = $${values.length}`)
    }
    if (from) {
      values.push(from)
      where.push(`ie.created_at >= $${values.length}::timestamptz`)
    }
    if (to) {
      values.push(to)
      where.push(`ie.created_at <= ($${values.length}::timestamptz + interval '1 day')`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM inventory_entries ie ${whereSql}`,
      values
    )
    const total = countResult.rows[0]?.total || 0

    const dataValues = [...values, limit, offset]
    const result = await pool.query(
      `SELECT
        ie.id,
        ie.product_id,
        p.name AS product_name,
        ie.type,
        ie.quantity,
        ie.source,
        ie.destination,
        ie.remarks,
        ie.images,
        ie.created_at
       FROM inventory_entries ie
       JOIN products p ON p.id = ie.product_id
       ${whereSql}
       ORDER BY ie.created_at DESC
       LIMIT $${dataValues.length - 1}
       OFFSET $${dataValues.length}`,
      dataValues
    )

    return res.json({
      items: result.rows,
      total,
      page,
      limit,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    })
  } catch (err) {
    next(err)
  }
}

const createInventoryEntry = async (req, res, next) => {
  try {
    const { product_id, type, quantity, source, destination, remarks, entry_date } = req.body

    if (!product_id || !type || !quantity) {
      return res.status(400).json({ message: "product_id, type and quantity are required." })
    }
    if (!["add", "remove", "adjustment", "shipment"].includes(type)) {
      return res.status(400).json({ message: "Invalid type." })
    }
    if (type === "add" && !source) {
      return res.status(400).json({ message: "source is required for add." })
    }
    if ((type === "remove" || type === "shipment") && !destination) {
      return res.status(400).json({ message: "destination is required for remove/shipment." })
    }

    // Upload all images to Supabase Storage, collect public URLs
    const imageUrls = []
    for (const file of req.files || []) {
      const url = await uploadToSupabase(file)
      imageUrls.push(url)
    }

    const client = await pool.connect()
    try {
      await client.query("BEGIN")

      const productResult = await client.query(
        "SELECT stock FROM products WHERE id = $1 FOR UPDATE",
        [product_id]
      )
      if (!productResult.rows.length) {
        await client.query("ROLLBACK")
        return res.status(404).json({ message: "Product not found." })
      }

      let nextStock = Number(productResult.rows[0].stock)
      const qty = Number(quantity)
      if (type === "add") nextStock += qty
      if (type === "remove") nextStock -= qty
      if (type === "adjustment") nextStock = qty

      await client.query(
        "UPDATE products SET stock = $1 WHERE id = $2",
        [nextStock, product_id]
      )

      const entryResult = await client.query(
        `INSERT INTO inventory_entries
         (product_id, type, quantity, source, destination, remarks, images, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [product_id, type, qty, source || null, destination || null, remarks || null, imageUrls,
         buildTimestamp(entry_date)]
      )

      await client.query("COMMIT")
      return res.status(201).json(entryResult.rows[0])
    } catch (err) {
      await client.query("ROLLBACK")
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    next(err)
  }
}

const deleteInventoryEntry = async (req, res, next) => {
  try {
    const { id } = req.params

    // Fetch the entry first to get images and reverse the stock change
    const entryResult = await pool.query(
      "SELECT * FROM inventory_entries WHERE id = $1",
      [id]
    )
    if (!entryResult.rows.length) {
      return res.status(404).json({ message: "Entry not found." })
    }

    const entry = entryResult.rows[0]
    const client = await pool.connect()
    try {
      await client.query("BEGIN")

      // Reverse the stock change caused by this entry
      const productResult = await client.query(
        "SELECT stock FROM products WHERE id = $1 FOR UPDATE",
        [entry.product_id]
      )
      if (productResult.rows.length) {
        let reversedStock = Number(productResult.rows[0].stock)
        const qty = Number(entry.quantity)
        if (entry.type === "add") reversedStock -= qty
        if (entry.type === "remove" || entry.type === "shipment") reversedStock += qty
        // For "adjustment" we can't reliably reverse — skip stock change
        if (entry.type !== "adjustment") {
          await client.query(
            "UPDATE products SET stock = $1 WHERE id = $2",
            [Math.max(0, reversedStock), entry.product_id]
          )
        }
      }

      await client.query("DELETE FROM inventory_entries WHERE id = $1", [id])
      await client.query("COMMIT")

      // Delete images from Supabase Storage (best effort, don't fail if missing)
      if (entry.images?.length) {
        const filenames = entry.images.map((url) => url.split("/").pop())
        await supabase.storage.from(BUCKET).remove(filenames)
      }

      return res.status(204).send()
    } catch (err) {
      await client.query("ROLLBACK")
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    next(err)
  }
}

// Build the timestamp: use entry_date for date part, current time for time-of-day
function buildTimestamp(entry_date) {
  if (!entry_date) return new Date().toISOString()
  const now = new Date()
  const [y, m, d] = entry_date.split("-")
  return new Date(Number(y), Number(m) - 1, Number(d),
    now.getHours(), now.getMinutes(), now.getSeconds()).toISOString()
}

// Bulk shipment: deducts all items in the deductions array in one transaction.
// The frontend computes the complete deductions list (including Blue Box / Ribbon).
// Corrugation boxes are NOT deducted — they are tracked informally via remarks.
// Body: { deductions: [{name, quantity}], destination, remarks, entry_date }
const bulkRemoveInventory = async (req, res, next) => {
  try {
    let deductions = req.body.deductions
    if (typeof deductions === "string") {
      try { deductions = JSON.parse(deductions) } catch { deductions = [] }
    }
    const { destination, remarks, entry_date } = req.body

    if (!deductions?.length) return res.status(400).json({ message: "deductions array is required." })
    if (!destination) return res.status(400).json({ message: "destination is required." })

    const ts = buildTimestamp(entry_date)

    const imageUrls = []
    for (const file of req.files || []) {
      const url = await uploadToSupabase(file)
      imageUrls.push(url)
    }

    const client = await pool.connect()
    try {
      await client.query("BEGIN")

      // Validate all items have sufficient stock before touching anything
      for (const { name, quantity } of deductions) {
        const qty = Number(quantity)
        const pr = await client.query(
          "SELECT id, stock FROM products WHERE LOWER(name) = LOWER($1)", [name]
        )
        if (!pr.rows.length) {
          await client.query("ROLLBACK")
          return res.status(404).json({ message: `Item not found: ${name}` })
        }
        if (Number(pr.rows[0].stock) < qty) {
          await client.query("ROLLBACK")
          return res.status(400).json({
            message: `Insufficient stock for "${name}". Have: ${pr.rows[0].stock}, Need: ${qty}`,
          })
        }
      }

      const results = []

      for (let i = 0; i < deductions.length; i++) {
        const { name, quantity } = deductions[i]
        const qty = Number(quantity)
        const pr = await client.query(
          "SELECT id, stock FROM products WHERE LOWER(name) = LOWER($1) FOR UPDATE", [name]
        )
        const newStock = Number(pr.rows[0].stock) - qty
        await client.query("UPDATE products SET stock = $1 WHERE id = $2", [newStock, pr.rows[0].id])
        const entry = await client.query(
          `INSERT INTO inventory_entries (product_id, type, quantity, destination, remarks, images, created_at)
           VALUES ($1, 'shipment', $2, $3, $4, $5, $6) RETURNING *`,
          [pr.rows[0].id, qty, destination, remarks || null, i === 0 ? imageUrls : [], ts]
        )
        results.push(entry.rows[0])
      }

      await client.query("COMMIT")
      return res.status(201).json({ entries: results })
    } catch (err) {
      await client.query("ROLLBACK")
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    next(err)
  }
}

// Bulk add: adds multiple items in one transaction (used by corrugation box flow)
// Body: { additions: [{name, quantity}], source, remarks, entry_date }
const bulkAddInventory = async (req, res, next) => {
  try {
    let additions = req.body.additions
    if (typeof additions === "string") {
      try { additions = JSON.parse(additions) } catch { additions = [] }
    }
    const { source, remarks, entry_date } = req.body

    if (!additions?.length) {
      return res.status(400).json({ message: "additions array is required." })
    }
    if (!source) {
      return res.status(400).json({ message: "source is required." })
    }

    // Upload images to Supabase if present
    const imageUrls = []
    for (const file of req.files || []) {
      const url = await uploadToSupabase(file)
      imageUrls.push(url)
    }

    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const results = []

      for (let i = 0; i < additions.length; i++) {
        const { name, quantity } = additions[i]
        const qty = Number(quantity)

        const productResult = await client.query(
          "SELECT id, stock FROM products WHERE LOWER(name) = LOWER($1) FOR UPDATE",
          [name]
        )
        if (!productResult.rows.length) {
          await client.query("ROLLBACK")
          return res.status(404).json({ message: `Item not found: ${name}` })
        }

        const product = productResult.rows[0]
        const newStock = Number(product.stock) + qty

        await client.query("UPDATE products SET stock = $1 WHERE id = $2", [newStock, product.id])

        const entryImages = i === 0 ? imageUrls : []
        const entry = await client.query(
          `INSERT INTO inventory_entries
           (product_id, type, quantity, source, remarks, images, created_at)
           VALUES ($1, 'add', $2, $3, $4, $5, $6)
           RETURNING *`,
          [product.id, qty, source, remarks || null, entryImages,
           buildTimestamp(entry_date)]
        )
        results.push(entry.rows[0])
      }

      await client.query("COMMIT")
      return res.status(201).json({ entries: results })
    } catch (err) {
      await client.query("ROLLBACK")
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    next(err)
  }
}

module.exports = { getInventoryEntries, createInventoryEntry, deleteInventoryEntry, bulkRemoveInventory, bulkAddInventory }