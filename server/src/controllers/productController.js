const pool = require("../config/db")

const getProducts = async (_req, res) => {
  const result = await pool.query("SELECT * FROM products ORDER BY id DESC")
  res.json(result.rows)
}

const createProduct = async (req, res) => {
  const { name, stock, low_stock_threshold } = req.body
  if (!name || stock === undefined || low_stock_threshold === undefined) {
    return res.status(400).json({ message: "name, stock and low_stock_threshold are required." })
  }

  const result = await pool.query(
    `INSERT INTO products (name, stock, low_stock_threshold)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [name, Number(stock), Number(low_stock_threshold)]
  )
  return res.status(201).json(result.rows[0])
}

const updateProduct = async (req, res) => {
  const { id } = req.params
  const { name, stock, low_stock_threshold } = req.body
  const result = await pool.query(
    `UPDATE products
     SET name = $1, stock = $2, low_stock_threshold = $3
     WHERE id = $4
     RETURNING *`,
    [name, Number(stock), Number(low_stock_threshold), id]
  )
  if (!result.rows.length) return res.status(404).json({ message: "Product not found." })
  return res.json(result.rows[0])
}

const deleteProduct = async (req, res) => {
  const { id } = req.params
  const result = await pool.query("DELETE FROM products WHERE id = $1 RETURNING id", [id])
  if (!result.rows.length) return res.status(404).json({ message: "Product not found." })
  return res.status(204).send()
}

module.exports = { getProducts, createProduct, updateProduct, deleteProduct }
