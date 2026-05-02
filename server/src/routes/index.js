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
  updateManufacturer,
  deleteManufacturer,
  getDestinations,
  createDestination,
  updateDestination,
  deleteDestination,
} = require("../controllers/adminController")
const { getInventoryEntries, createInventoryEntry, deleteInventoryEntry, bulkRemoveInventory, bulkAddInventory } = require("../controllers/inventoryController")
const { fetchDashboardStats, fetchStockMovement } = require("../controllers/dashboardController")
const { verifyAdminPassword } = require("../controllers/authController")
const { getReportStats } = require("../controllers/reportsController")
const upload = require("../middleware/upload")

const router = express.Router()

router.get("/products", getProducts)
router.post("/products", createProduct)
router.put("/products/:id", updateProduct)
router.delete("/products/:id", deleteProduct)

router.get("/manufacturers", getManufacturers)
router.post("/manufacturers", createManufacturer)
router.put("/manufacturers/:id", updateManufacturer)
router.delete("/manufacturers/:id", deleteManufacturer)
router.get("/destinations", getDestinations)
router.post("/destinations", createDestination)
router.put("/destinations/:id", updateDestination)
router.delete("/destinations/:id", deleteDestination)

router.get("/inventory-entries", getInventoryEntries)
router.post("/inventory-entries", upload.array("images", 3), createInventoryEntry)
router.post("/inventory-entries/bulk-remove", upload.array("images", 3), bulkRemoveInventory)
router.post("/inventory-entries/bulk-add", upload.array("images", 3), bulkAddInventory)
router.delete("/inventory-entries/:id", deleteInventoryEntry)

router.get("/dashboard/stats", fetchDashboardStats)
router.get("/dashboard/stock-movement", fetchStockMovement)

router.post("/auth/admin", verifyAdminPassword)
router.get("/reports/stats", getReportStats)

module.exports = router
