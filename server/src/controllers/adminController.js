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

const updateManufacturer = async (req, res) => {
  const { id } = req.params
  const { name } = req.body
  if (!name) return res.status(400).json({ message: "name is required." })
  const result = await pool.query(
    "UPDATE manufacturers SET name = $1 WHERE id = $2 RETURNING *",
    [name, id]
  )
  if (!result.rows.length) return res.status(404).json({ message: "Manufacturer not found." })
  return res.json(result.rows[0])
}

const deleteManufacturer = async (req, res) => {
  const { id } = req.params
  // Check if this manufacturer name is used in any inventory entry source
  const mfr = await pool.query("SELECT name FROM manufacturers WHERE id = $1", [id])
  if (!mfr.rows.length) return res.status(404).json({ message: "Manufacturer not found." })
  const mfrName = mfr.rows[0].name
  const usageCheck = await pool.query(
    "SELECT COUNT(*)::int AS cnt FROM inventory_entries WHERE source = $1",
    [mfrName]
  )
  if (usageCheck.rows[0].cnt > 0) {
    return res.status(409).json({
      message: `Cannot delete "${mfrName}" — it is referenced in ${usageCheck.rows[0].cnt} inventory entry/entries.`,
    })
  }
  await pool.query("DELETE FROM manufacturers WHERE id = $1", [id])
  return res.status(204).send()
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

const updateDestination = async (req, res) => {
  const { id } = req.params
  const { name } = req.body
  if (!name) return res.status(400).json({ message: "name is required." })
  const result = await pool.query(
    "UPDATE destinations SET name = $1 WHERE id = $2 RETURNING *",
    [name, id]
  )
  if (!result.rows.length) return res.status(404).json({ message: "Destination not found." })
  return res.json(result.rows[0])
}

const deleteDestination = async (req, res) => {
  const { id } = req.params
  const dest = await pool.query("SELECT name FROM destinations WHERE id = $1", [id])
  if (!dest.rows.length) return res.status(404).json({ message: "Destination not found." })
  const destName = dest.rows[0].name
  const usageCheck = await pool.query(
    "SELECT COUNT(*)::int AS cnt FROM inventory_entries WHERE destination = $1",
    [destName]
  )
  if (usageCheck.rows[0].cnt > 0) {
    return res.status(409).json({
      message: `Cannot delete "${destName}" — it is referenced in ${usageCheck.rows[0].cnt} inventory entry/entries.`,
    })
  }
  await pool.query("DELETE FROM destinations WHERE id = $1", [id])
  return res.status(204).send()
}

module.exports = {
  getManufacturers,
  createManufacturer,
  updateManufacturer,
  deleteManufacturer,
  getDestinations,
  createDestination,
  updateDestination,
  deleteDestination,
}
