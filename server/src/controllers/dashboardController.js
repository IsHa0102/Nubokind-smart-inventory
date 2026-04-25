const { getDashboardStats, getStockMovement } = require("../services/dashboardService")

const fetchDashboardStats = async (_req, res) => {
  const stats = await getDashboardStats()
  res.json(stats)
}

const fetchStockMovement = async (_req, res) => {
  const movement = await getStockMovement()
  res.json(movement)
}

module.exports = { fetchDashboardStats, fetchStockMovement }
