const express = require("express")
const cors = require("cors")
const routes = require("./routes")

const app = express()

app.use(cors())
app.use(express.json())
app.use("/api", routes)

app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(500).json({ message: "Internal server error." })
})

module.exports = app
