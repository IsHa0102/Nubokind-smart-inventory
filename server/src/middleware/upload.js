const multer = require("multer")

// Keep files in memory as Buffer — we'll stream them to Supabase Storage
const storage = multer.memoryStorage()

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
