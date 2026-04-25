const pool = require("../config/db")

const createInventoryEntry = async (req, res) => {
  const { product_id, type, quantity, source, destination, remarks } = req.body
  const images = (req.files || []).map((file) => file.originalname)

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
    const productResult = await client.query("SELECT stock FROM products WHERE id = $1 FOR UPDATE", [product_id])
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
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

module.exports = { createInventoryEntry }
