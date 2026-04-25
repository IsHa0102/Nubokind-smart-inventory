const express = require("express")
const {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} = require("../controllers/productController")
const {
  getManufacturers,
  createManufacturer,
  getDestinations,
  createDestination,
} = require("../controllers/adminController")
const { createInventoryEntry } = require("../controllers/inventoryController")
const { fetchDashboardStats, fetchStockMovement } = require("../controllers/dashboardController")
const upload = require("../middleware/upload")

const router = express.Router()

router.get("/products", getProducts)
router.post("/products", createProduct)
router.put("/products/:id", updateProduct)
router.delete("/products/:id", deleteProduct)

router.get("/manufacturers", getManufacturers)
router.post("/manufacturers", createManufacturer)
router.get("/destinations", getDestinations)
router.post("/destinations", createDestination)

router.post("/inventory-entries", upload.array("images", 3), createInventoryEntry)

router.get("/dashboard/stats", fetchDashboardStats)
router.get("/dashboard/stock-movement", fetchStockMovement)

module.exports = router
