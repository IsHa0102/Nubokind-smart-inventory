const pool = require("../config/db")

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
    // Store the served filename (disk storage gives file.filename)
    const images = (req.files || []).map((file) => file.filename)

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

      await client.query("UPDATE products SET stock = $1 WHERE id = $2", [nextStock, product_id])

      const entryResult = await client.query(
        `INSERT INTO inventory_entries
         (product_id, type, quantity, source, destination, remarks, images)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [product_id, type, qty, source || null, destination || null, remarks || null, images]
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

module.exports = { getInventoryEntries, createInventoryEntry }
