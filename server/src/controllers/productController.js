const pool = require("../config/db")

const getProducts = async (_req, res, next) => {
  try {
    const result = await pool.query("SELECT * FROM products ORDER BY id DESC")
    res.json(result.rows)
  } catch (err) {
    next(err)
  }
}

const createProduct = async (req, res, next) => {
  try {
    const { name, stock, low_stock_threshold, item_type } = req.body
    if (!name || stock === undefined || low_stock_threshold === undefined || !item_type) {
      return res.status(400).json({ message: "name, stock, low_stock_threshold, and item_type are required." })
    }
    if (!["Product", "Packaging"].includes(item_type)) {
      return res.status(400).json({ message: "item_type must be 'Product' or 'Packaging'." })
    }
    const result = await pool.query(
      `INSERT INTO products (name, stock, low_stock_threshold, item_type)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, Number(stock), Number(low_stock_threshold), item_type]
    )
    return res.status(201).json(result.rows[0])
  } catch (err) {
    // Friendly message for duplicate name
    if (err.code === "23505") {
      return res.status(409).json({ message: "A product with this name already exists." })
    }
    next(err)
  }
}

const updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params
    const { name, stock, low_stock_threshold, item_type } = req.body
    const updates = []
    const values = []
    let paramIndex = 1

    if (name !== undefined) { updates.push(`name = $${paramIndex++}`); values.push(name) }
    if (stock !== undefined) { updates.push(`stock = $${paramIndex++}`); values.push(Number(stock)) }
    if (low_stock_threshold !== undefined) { updates.push(`low_stock_threshold = $${paramIndex++}`); values.push(Number(low_stock_threshold)) }
    if (item_type !== undefined) {
      if (!["Product", "Packaging"].includes(item_type)) {
        return res.status(400).json({ message: "item_type must be 'Product' or 'Packaging'." })
      }
      updates.push(`item_type = $${paramIndex++}`)
      values.push(item_type)
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No fields to update." })
    }

    values.push(id)
    const result = await pool.query(
      `UPDATE products SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values
    )
    if (!result.rows.length) return res.status(404).json({ message: "Product not found." })
    return res.json(result.rows[0])
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ message: "A product with this name already exists." })
    }
    next(err)
  }
}

const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params
    const usageCheck = await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM inventory_entries WHERE product_id = $1",
      [id]
    )
    if (usageCheck.rows[0].cnt > 0) {
      return res.status(409).json({
        message: `Cannot delete — this product has ${usageCheck.rows[0].cnt} inventory entries.`,
      })
    }
    const result = await pool.query("DELETE FROM products WHERE id = $1 RETURNING id", [id])
    if (!result.rows.length) return res.status(404).json({ message: "Product not found." })
    return res.status(204).send()
  } catch (err) {
    next(err)
  }
}

module.exports = { getProducts, createProduct, updateProduct, deleteProduct }
