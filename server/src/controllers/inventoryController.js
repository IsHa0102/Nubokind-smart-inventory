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
    const { product_id, type, quantity, source, destination, remarks } = req.body

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
         (product_id, type, quantity, source, destination, remarks, images)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [product_id, type, qty, source || null, destination || null, remarks || null, imageUrls]
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

module.exports = { getInventoryEntries, createInventoryEntry, deleteInventoryEntry }
