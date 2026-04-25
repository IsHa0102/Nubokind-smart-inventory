const pool = require("../config/db")

const getManufacturers = async (_req, res) => {
  const result = await pool.query("SELECT * FROM manufacturers ORDER BY name ASC")
  res.json(result.rows)
}

const createManufacturer = async (req, res) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ message: "name is required." })
  const result = await pool.query("INSERT INTO manufacturers (name) VALUES ($1) RETURNING *", [name])
  res.status(201).json(result.rows[0])
}

const getDestinations = async (_req, res) => {
  const result = await pool.query("SELECT * FROM destinations ORDER BY name ASC")
  res.json(result.rows)
}

const createDestination = async (req, res) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ message: "name is required." })
  const result = await pool.query("INSERT INTO destinations (name) VALUES ($1) RETURNING *", [name])
  res.status(201).json(result.rows[0])
}

module.exports = {
  getManufacturers,
  createManufacturer,
  getDestinations,
  createDestination,
}
