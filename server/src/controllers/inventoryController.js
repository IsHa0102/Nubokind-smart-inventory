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
    if (type && ["add", "remove", "adjustment"].includes(type)) {
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
    if (!["add", "remove", "adjustment"].includes(type)) {
      return res.status(400).json({ message: "Invalid type." })
    }
    if (type === "add" && !source) {
      return res.status(400).json({ message: "source is required for add." })
    }
    if (type === "remove" && !destination) {
      return res.status(400).json({ message: "destination is required for remove." })
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
        if (entry.type === "remove") reversedStock += qty
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

// Bulk remove: deducts multiple items in one transaction
// Body: { deductions: [{name, quantity}], destination, remarks }
// Corrugation box capacity per assembled product
const CORRUGATION_CAPACITY = {
  "ele ring silicone teether set": 200,
  "kiko no drop teether":          115,
  "cloth book set":                 28,
  "newborn gift kit":               28,
}

// Determine which assembled product a deduction list represents
// by checking if the deductions match a known product's items
const PRODUCT_KEYS_BY_ITEMS = {
  ele:     ["sage green teether", "aqua blue teether", "slate grey teether", "oat beige teether", "baby pink teether", "ele box", "ele thank you card", "potli"],
  kiko:    ["sage green kiko teether", "cloud white kiko teether", "kiko box", "thank you card", "potli"],
  cloth:   ["my first patterns book", "my first faces book", "my first puzzles book", "book kit sleeve", "book kit thank you card"],
  newborn: ["flashcards", "ribbon", "cloth book", "banner", "gift kit sleeve", "gift kit thank you card"],
}

const PRODUCT_CAPACITY_BY_KEY = {
  ele:     200,
  kiko:    115,
  cloth:   28,
  newborn: 28,
}

function detectProductKey(deductions) {
  const names = deductions.map((d) => d.name.toLowerCase())
  for (const [key, items] of Object.entries(PRODUCT_KEYS_BY_ITEMS)) {
    if (items.some((item) => names.includes(item))) return key
  }
  return null
}

// Get representative quantity (excludes multiplied items like Flashcards)
function getRefQty(deductions) {
  const nonMultiplied = deductions.filter(d => d.name.toLowerCase() !== "flashcards")
  const source = nonMultiplied.length > 0 ? nonMultiplied : deductions
  return Math.min(...source.map(d => Number(d.quantity)))
}

// Build the timestamp: use entry_date for date part, but NOW() for time
function buildTimestamp(entry_date) {
  if (!entry_date) return new Date().toISOString()
  // Combine selected date with current time so history shows correct time-of-day
  const now = new Date()
  const [y, m, d] = entry_date.split("-")
  return new Date(Number(y), Number(m) - 1, Number(d),
    now.getHours(), now.getMinutes(), now.getSeconds()).toISOString()
}

const bulkRemoveInventory = async (req, res, next) => {
  try {
    let deductions = req.body.deductions
    if (typeof deductions === "string") {
      try { deductions = JSON.parse(deductions) } catch { deductions = [] }
    }
    const { destination, remarks, entry_date } = req.body

    if (!deductions?.length) return res.status(400).json({ message: "deductions array is required." })
    if (!destination) return res.status(400).json({ message: "destination is required." })

    const productKey = detectProductKey(deductions)
    const refQty = getRefQty(deductions)
    const ts = buildTimestamp(entry_date)

    // Pre-calculate corrugation boxes needed
    const corrugationBoxes = productKey && PRODUCT_CAPACITY_BY_KEY[productKey]
      ? Math.ceil(refQty / PRODUCT_CAPACITY_BY_KEY[productKey])
      : 0

    const needsBlueBox = productKey === "cloth" || productKey === "newborn"
    const needsRibbon  = productKey === "newborn"

    // Upload images
    const imageUrls = []
    for (const file of req.files || []) {
      const url = await uploadToSupabase(file)
      imageUrls.push(url)
    }

    const client = await pool.connect()
    try {
      await client.query("BEGIN")

      // ── Validate all auto-deducted items BEFORE touching anything ──────────
      if (corrugationBoxes > 0) {
        const r = await client.query("SELECT stock FROM products WHERE LOWER(name) = 'corrugation box'")
        if (!r.rows.length) {
          await client.query("ROLLBACK")
          return res.status(404).json({ message: '"Corrugation Box" not found in inventory.' })
        }
        if (Number(r.rows[0].stock) < corrugationBoxes) {
          await client.query("ROLLBACK")
          return res.status(400).json({ message: `Insufficient Corrugation Box stock. Have: ${r.rows[0].stock}, Need: ${corrugationBoxes}` })
        }
      }
      if (needsBlueBox) {
        const r = await client.query("SELECT stock FROM products WHERE LOWER(name) = 'blue box'")
        if (!r.rows.length) {
          await client.query("ROLLBACK")
          return res.status(404).json({ message: '"Blue Box" not found in inventory. Add it via Admin first.' })
        }
        if (Number(r.rows[0].stock) < refQty) {
          await client.query("ROLLBACK")
          return res.status(400).json({ message: `Insufficient Blue Box stock. Have: ${r.rows[0].stock}, Need: ${refQty}` })
        }
      }
      if (needsRibbon) {
        const r = await client.query("SELECT stock FROM products WHERE LOWER(name) = 'ribbon'")
        if (!r.rows.length) {
          await client.query("ROLLBACK")
          return res.status(404).json({ message: '"Ribbon" not found in inventory. Add it via Admin first.' })
        }
        if (Number(r.rows[0].stock) < refQty) {
          await client.query("ROLLBACK")
          return res.status(400).json({ message: `Insufficient Ribbon stock. Have: ${r.rows[0].stock}m, Need: ${refQty}m` })
        }
      }

      const results = []

      // ── Deduct main items ──────────────────────────────────────────────────
      for (let i = 0; i < deductions.length; i++) {
        const { name, quantity } = deductions[i]
        const qty = Number(quantity)
        const pr = await client.query(
          "SELECT id, stock FROM products WHERE LOWER(name) = LOWER($1) FOR UPDATE", [name]
        )
        if (!pr.rows.length) {
          await client.query("ROLLBACK")
          return res.status(404).json({ message: `Item not found: ${name}` })
        }
        const newStock = Number(pr.rows[0].stock) - qty
        if (newStock < 0) {
          await client.query("ROLLBACK")
          return res.status(400).json({ message: `Insufficient stock for "${name}". Have: ${pr.rows[0].stock}, Need: ${qty}` })
        }
        await client.query("UPDATE products SET stock = $1 WHERE id = $2", [newStock, pr.rows[0].id])
        const entry = await client.query(
          `INSERT INTO inventory_entries (product_id, type, quantity, destination, remarks, images, created_at)
           VALUES ($1, 'remove', $2, $3, $4, $5, $6) RETURNING *`,
          [pr.rows[0].id, qty, destination, remarks || null, i === 0 ? imageUrls : [], ts]
        )
        results.push(entry.rows[0])
      }

      // ── Auto-deduct Corrugation Box ────────────────────────────────────────
      if (corrugationBoxes > 0) {
        const r = await client.query("SELECT id, stock FROM products WHERE LOWER(name) = 'corrugation box' FOR UPDATE")
        await client.query("UPDATE products SET stock = $1 WHERE id = $2", [Number(r.rows[0].stock) - corrugationBoxes, r.rows[0].id])
        const e = await client.query(
          `INSERT INTO inventory_entries (product_id, type, quantity, destination, remarks, images, created_at)
           VALUES ($1, 'remove', $2, $3, $4, '{}', $5) RETURNING *`,
          [r.rows[0].id, corrugationBoxes, destination, `Auto: corrugation for ${productKey}`, ts]
        )
        results.push(e.rows[0])
      }

      // ── Auto-deduct Blue Box ───────────────────────────────────────────────
      if (needsBlueBox) {
        const r = await client.query("SELECT id, stock FROM products WHERE LOWER(name) = 'blue box' FOR UPDATE")
        await client.query("UPDATE products SET stock = $1 WHERE id = $2", [Number(r.rows[0].stock) - refQty, r.rows[0].id])
        const e = await client.query(
          `INSERT INTO inventory_entries (product_id, type, quantity, destination, remarks, images, created_at)
           VALUES ($1, 'remove', $2, $3, $4, '{}', $5) RETURNING *`,
          [r.rows[0].id, refQty, destination, `Auto: blue box for ${productKey}`, ts]
        )
        results.push(e.rows[0])
      }

      // ── Auto-deduct Ribbon ─────────────────────────────────────────────────
      if (needsRibbon) {
        const r = await client.query("SELECT id, stock FROM products WHERE LOWER(name) = 'ribbon' FOR UPDATE")
        await client.query("UPDATE products SET stock = $1 WHERE id = $2", [Number(r.rows[0].stock) - refQty, r.rows[0].id])
        const e = await client.query(
          `INSERT INTO inventory_entries (product_id, type, quantity, destination, remarks, images, created_at)
           VALUES ($1, 'remove', $2, $3, $4, '{}', $5) RETURNING *`,
          [r.rows[0].id, refQty, destination, `Auto: ${refQty}m ribbon for newborn`, ts]
        )
        results.push(e.rows[0])
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