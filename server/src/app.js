const express = require("express")
const cors = require("cors")
const path = require("path")
const routes = require("./routes")

const app = express()

app.use(cors())
app.use(express.json())

// Serve uploaded images as static files at /uploads/<filename>
app.use("/uploads", express.static(path.join(__dirname, "../../uploads")))

app.use("/api", routes)

// Global error handler
app.use((error, _req, res, _next) => {
  console.error("[Server Error]", error?.message || error)
  res.status(500).json({ message: error?.message || "Internal server error." })
})

module.exports = app
