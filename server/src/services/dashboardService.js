const pool = require("../config/db")

const getDashboardStats = async () => {
  const totalStockResult = await pool.query("SELECT COALESCE(SUM(stock), 0)::int AS total_stock FROM warehouse_products")
  const lowStockResult = await pool.query(
    "SELECT COUNT(*)::int AS low_stock_count FROM warehouse_products WHERE stock > 0 AND stock <= low_stock_threshold"
  )
  const outOfStockResult = await pool.query("SELECT COUNT(*)::int AS out_of_stock_count FROM warehouse_products WHERE stock <= 0")
  const topMoverResult = await pool.query(
    `SELECT p.name, COALESCE(SUM(ABS(ie.quantity)), 0)::int AS movement
     FROM warehouse_entries ie
     JOIN warehouse_products p ON p.id = ie.product_id
     GROUP BY p.name
     ORDER BY movement DESC
     LIMIT 1`
  )

  return {
    totalStock: totalStockResult.rows[0].total_stock,
    lowStockCount: lowStockResult.rows[0].low_stock_count,
    outOfStockCount: outOfStockResult.rows[0].out_of_stock_count,
    topMover: topMoverResult.rows[0] || null,
  }
}

const getStockMovement = async () => {
  const result = await pool.query(
    `SELECT TO_CHAR(created_at::date, 'YYYY-MM-DD') AS day,
            type,
            COALESCE(SUM(quantity), 0)::int AS total
     FROM warehouse_entries
     WHERE created_at >= NOW() - INTERVAL '7 days'
     GROUP BY created_at::date, type
     ORDER BY day ASC`
  )

  const map = {}
  result.rows.forEach((row) => {
    if (!map[row.day]) {
      map[row.day] = { day: row.day, add: 0, remove: 0, adjustment: 0 }
    }
    map[row.day][row.type] = row.total
  })

  return Object.values(map)
}

module.exports = { getDashboardStats, getStockMovement }
