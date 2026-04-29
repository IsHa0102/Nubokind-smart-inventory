const multer = require("multer")
const path = require("path")
const fs = require("fs")

// Save uploads to disk so they can be served as static files
const uploadDir = path.join(__dirname, "../../uploads")
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    // Unique filename: timestamp + original name (sanitised)
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")
    cb(null, `${Date.now()}_${safeName}`)
  },
})

const upload = multer({
  storage,
  limits: { files: 3, fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"))
    }
    cb(null, true)
  },
})

module.exports = upload
