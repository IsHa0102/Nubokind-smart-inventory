require("dotenv").config()
const { Pool } = require("pg")

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

const products = [
  { name: "Corrugation Box",         stock: 195,  item_type: "Packaging" },
  { name: "Potli",                   stock: 0,    item_type: "Packaging" },
  { name: "Gift Kit Thank You Card", stock: 139,  item_type: "Packaging" },
  { name: "Gift Kit Sleeve",         stock: 139,  item_type: "Packaging" },
  { name: "Banner",                  stock: 139,  item_type: "Product"   },
  { name: "Cloth Book",              stock: 139,  item_type: "Product"   },
  { name: "Ribbon",                  stock: 144,  item_type: "Product"   },
  { name: "Flashcards",              stock: 440,  item_type: "Product"   },
  { name: "Book Kit Thank You Card", stock: 144,  item_type: "Packaging" },
  { name: "Book Kit Sleeve",         stock: 144,  item_type: "Packaging" },
  { name: "Blue Box",                stock: 144,  item_type: "Packaging" },
  { name: "My First Puzzles Book",   stock: 144,  item_type: "Product"   },
  { name: "My First Faces Book",     stock: 144,  item_type: "Product"   },
  { name: "My First Patterns Book",  stock: 144,  item_type: "Product"   },
  { name: "Thank You Card",          stock: 0,    item_type: "Packaging" },
  { name: "Kiko Box",                stock: 0,    item_type: "Packaging" },
  { name: "Cloud White Kiko Teether",stock: 200,  item_type: "Product"   },
  { name: "Sage Green Kiko Teether", stock: 0,    item_type: "Product"   },
  { name: "Ele Thank You Card",      stock: 200,  item_type: "Packaging" },
  { name: "Ele Box",                 stock: 2564, item_type: "Packaging" },
  { name: "Baby Pink Teether",       stock: 871,  item_type: "Product"   },
  { name: "Oat Beige Teether",       stock: 543,  item_type: "Product"   },
  { name: "Slate Grey Teether",      stock: 337,  item_type: "Product"   },
  { name: "Aqua Blue Teether",       stock: 37,   item_type: "Product"   },
  { name: "Sage Green Teether",      stock: 20,   item_type: "Product"   },
]

const manufacturers = [
  "china courier",
  "Other",
  "Packaging / Printing Shop",
  "rajkot",
  "RPS",
  "Vidhaata",
]

const destinations = [
  "amazon warehouse",
  "Blinkit Warehouse",
  "Eshop Warehouse",
  "other",
  "Ozi Warehouse",
]

async function seed() {
  const client = await pool.connect()
  try {
    console.log("Seeding warehouse_products...")
    for (const p of products) {
      await client.query(
        `INSERT INTO warehouse_products (name, stock, low_stock_threshold, item_type)
         VALUES ($1, $2, 10, $3)
         ON CONFLICT (name) DO NOTHING`,
        [p.name, p.stock, p.item_type]
      )
    }
    console.log(`  ${products.length} products inserted.`)

    console.log("Seeding warehouse_manufacturers...")
    for (const m of manufacturers) {
      await client.query(
        `INSERT INTO warehouse_manufacturers (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
        [m]
      )
    }
    console.log(`  ${manufacturers.length} manufacturers inserted.`)

    console.log("Seeding warehouse_destinations...")
    for (const d of destinations) {
      await client.query(
        `INSERT INTO warehouse_destinations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
        [d]
      )
    }
    console.log(`  ${destinations.length} destinations inserted.`)

    console.log("Done.")
  } finally {
    client.release()
    await pool.end()
  }
}

seed().catch((e) => { console.error(e.message); process.exit(1) })
