const pool = require("../config/db")

const getReportStats = async (req, res, next) => {
  try {
    const { from, to, itemType } = req.query

    const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
    const toDate = to || new Date().toISOString().split("T")[0]

    // Summary cards
    const stockResult = await pool.query(`
      SELECT
        SUM(stock) AS total_stock,
        COUNT(*) FILTER (WHERE stock = 0) AS out_of_stock,
        COUNT(*) FILTER (WHERE stock > 0 AND stock <= low_stock_threshold) AS low_stock
      FROM products
      ${itemType ? `WHERE item_type = $1` : ""}
    `, itemType ? [itemType] : [])

    const summary = stockResult.rows[0]

    // Movement trend (daily add vs remove)
    const trendResult = await pool.query(`
      SELECT
        DATE(ie.created_at) AS date,
        SUM(CASE WHEN ie.type = 'add' THEN ie.quantity ELSE 0 END) AS added,
        SUM(CASE WHEN ie.type = 'remove' THEN ie.quantity ELSE 0 END) AS removed
      FROM inventory_entries ie
      JOIN products p ON p.id = ie.product_id
      WHERE ie.created_at >= $1::date
        AND ie.created_at < ($2::date + interval '1 day')
        ${itemType ? "AND p.item_type = $3" : ""}
      GROUP BY DATE(ie.created_at)
      ORDER BY date ASC
    `, itemType ? [fromDate, toDate, itemType] : [fromDate, toDate])

    // Top moving items
    const topItemsResult = await pool.query(`
      SELECT
        p.name,
        p.item_type,
        p.stock AS current_stock,
        SUM(CASE WHEN ie.type = 'add' THEN ie.quantity ELSE 0 END) AS total_added,
        SUM(CASE WHEN ie.type = 'remove' THEN ie.quantity ELSE 0 END) AS total_removed
      FROM products p
      LEFT JOIN inventory_entries ie
        ON ie.product_id = p.id
        AND ie.created_at >= $1::date
        AND ie.created_at < ($2::date + interval '1 day')
        ${itemType ? "AND p.item_type = $3" : ""}
      ${itemType ? "WHERE p.item_type = $3" : ""}
      GROUP BY p.id, p.name, p.item_type, p.stock
      ORDER BY total_removed DESC NULLS LAST
    `, itemType ? [fromDate, toDate, itemType] : [fromDate, toDate])

    // Days remaining forecast
    const days = Math.max(
      1,
      Math.ceil((new Date(toDate) - new Date(fromDate)) / (1000 * 60 * 60 * 24))
    )

    const forecast = topItemsResult.rows.map((item) => {
      const avgDaily = Number(item.total_removed) / days
      const daysLeft = avgDaily > 0 ? Math.floor(Number(item.current_stock) / avgDaily) : null
      return {
        name: item.name,
        item_type: item.item_type,
        current_stock: Number(item.current_stock),
        avg_daily_usage: parseFloat(avgDaily.toFixed(2)),
        days_remaining: daysLeft,
        total_added: Number(item.total_added),
        total_removed: Number(item.total_removed),
      }
    })

    return res.json({
      summary: {
        total_stock: Number(summary.total_stock) || 0,
        out_of_stock: Number(summary.out_of_stock) || 0,
        low_stock: Number(summary.low_stock) || 0,
      },
      trend: trendResult.rows.map((r) => ({
        date: r.date,
        added: Number(r.added),
        removed: Number(r.removed),
      })),
      topItems: forecast,
      period: { from: fromDate, to: toDate, days },
    })
  } catch (err) {
    next(err)
  }
}

module.exports = { getReportStats }
