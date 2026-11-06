// Shared shipment product configuration — used by Stock Entry, Consignments,
// Inventory (buildable counts) and Global Search.
//
// Two naming layers, kept in step with the amazon-dashboard project:
//   • SKU labels (what we ship) = sku_mapping.product_name for that master ID,
//     e.g. TE-BA-BL-1 → "Ball Teether Blue".
//   • Component names (what is deducted) = warehouse_products.name, verbatim.
//     Each one is also pinned to its warehouse item_code in COMPONENT_CODES, and
//     lookups go by code first — so renaming an item in Admin can't break
//     shipments again (that is how "Ball Teether Blue not found" happened: the
//     row had been renamed "Orbi Ball Teether Blue").
//
// Product / variant `key`s are stored on saved consignment lines. Never change them.

// Component name (as shown in the app) → warehouse_products.item_code
export const COMPONENT_CODES = {
  "Ele Sage Green Teether":       "RI-TE-EL-SG",
  "Ele Aqua Blue Teether":        "RI-TE-EL-AB",
  "Ele Baby Pink Teether":        "RI-TE-EL-BP",
  "Ele Oat Beige Teether":        "RI-TE-EL-OB",
  "Ele Slate Grey Teether":       "RI-TE-EL-SL",
  "Ele Monocarton Box":           "PK-BOX-EL",
  "Kiko Teether Green":           "RI-TE-KI-GR",
  "Kiko Teether White":           "RI-TE-KI-WH",
  "Kiko Teether Blue":            "RI-TE-KI-BL",
  "Kiko Monocarton Box":          "PK-BOX-KI",
  "Orbi Ball Teether Yellow":     "RI-TE-BA-YE",
  "Orbi Ball Teether Blue":       "RI-TE-BA-BL",
  "Orbi Ball Teether Box":        "PK-BOX-BA",
  "Teether Thank You Card":       "PK-CRD-TE",
  "Potli":                        "PK-PTL",
  "My First Patterns Book":       "RI-BO-PT",
  "My First Faces Book":          "RI-BO-FC",
  "My First Puzzles Book":        "RI-BO-PZ",
  "Book Kit Sleeve":              "PK-SLV-BO",
  "Book Kit Thank You Card":      "PK-CRD-BO",
  "Blue Box":                     "PK-BOX-BL",
  "Flashcards":                   "RI-HC-FK",
  "My First Book":                "RI-BO-MF",
  "Banner":                       "RI-HC-BN",
  "Ribbon":                       "RI-AC-RB",
  "Sensory Kit Sleeve":           "PK-SLV-SK",
  "Sensory Kit Thank You Card":   "PK-CRD-SK",
  "Flashcard Kit Thank You Card": "PK-CRD-FK",
  "Flashcard Kit Box":            "PK-BOX-FK",
  "Sensory Mat":                  "MA-SA-MAT",
  "Sensory Mat Box":              "MA-SA-BOX",
  "Sensory Mat Thank You Card":   "MA-SA-TYC",
  "Ganesha Plushie":              "PL-CG-PLU",
  "Ganesha Box":                  "PL-CG-BOX",
  "Ganesha Thank You Card":       "PL-CG-TYC",
  "Plastic Packaging":            "PK-PLA",
  "Corrugation Box":              "PK-BOX-CG",
}

export const SHIPMENT_PRODUCTS = [
  {
    key: "ele",
    label: "Ele Ring Silicone Teether Set",
    masterId: null,
    image: "https://res.cloudinary.com/dgqcdiyad/image/upload/f_auto,q_auto/ele-teether-blue-beige__wljswi",
    variants: [
      { key: "sg_ab", label: "Ele Teether Blue Green",  masterId: "TE-EL-BL-GR-2", colors: ["Ele Sage Green Teether", "Ele Aqua Blue Teether"] },
      { key: "bp_ob", label: "Ele Teether Beige Pink",  masterId: "TE-EL-BE-PI-2", colors: ["Ele Baby Pink Teether", "Ele Oat Beige Teether"] },
      { key: "sg_sg", label: "Ele Teether Green Grey",  masterId: "TE-EL-GR-GY-2", colors: ["Ele Sage Green Teether", "Ele Slate Grey Teether"] },
      { key: "ab_ob", label: "Ele Teether Beige Blue",  masterId: "TE-EL-BE-BL-2", colors: ["Ele Aqua Blue Teether", "Ele Oat Beige Teether"] },
      { key: "ab_bp", label: "Ele Teether Blue Pink",   masterId: "TE-EL-BL-PI-2", colors: ["Ele Aqua Blue Teether", "Ele Baby Pink Teether"] },
      { key: "sg_ob", label: "Ele Teether Beige Green", masterId: "TE-EL-BE-GR-2", colors: ["Ele Sage Green Teether", "Ele Oat Beige Teether"] },
      { key: "sg_bp", label: "Ele Teether Green Pink",  masterId: "TE-EL-GR-PI-2", colors: ["Ele Sage Green Teether", "Ele Baby Pink Teether"] },
    ],
    fixedItems: ["Ele Monocarton Box"],
    autoDeducts: [{ name: "Teether Thank You Card", multiplier: 1 }],
  },
  {
    key: "kiko",
    label: "Kiko No Drop Teether",
    masterId: null,
    image: "https://res.cloudinary.com/dgqcdiyad/image/upload/f_auto,q_auto/kiko_teether_baby_hand_green_b23ujn",
    variants: [
      { key: "sg", label: "Kiko Teether Green", masterId: "TE-KI-GR-1", colors: ["Kiko Teether Green"] },
      { key: "cw", label: "Kiko Teether White", masterId: "TE-KI-WH-1", colors: ["Kiko Teether White"] },
      { key: "bl", label: "Kiko Teether Blue",  masterId: "TE-KI-BL-1", colors: ["Kiko Teether Blue"]  },
    ],
    fixedItems: ["Kiko Monocarton Box"],
    autoDeducts: [
      { name: "Teether Thank You Card", multiplier: 1 },
      { name: "Potli", multiplier: 1 },
    ],
  },
  {
    key: "cloth",
    label: "High Contrast Bookset",
    masterId: "BO-HC-3",
    image: "https://res.cloudinary.com/dgqcdiyad/image/upload/f_auto,q_auto/cloth_book_uu9rnk",
    variants: null,
    fixedItems: [
      "My First Patterns Book", "My First Faces Book", "My First Puzzles Book",
      "Book Kit Sleeve", "Book Kit Thank You Card",
    ],
    autoDeducts: [{ name: "Blue Box", multiplier: 1 }],
  },
  {
    key: "newborn",
    label: "High Contrast Sensory Kit",
    masterId: "SK-HC-3",
    image: "https://res.cloudinary.com/dgqcdiyad/image/upload/f_auto,q_auto/montessori_kit_gysxiw",
    variants: null,
    fixedItems: [
      { name: "Flashcards", multiplier: 10 },
      "My First Book", "Banner",
      "Sensory Kit Sleeve", "Sensory Kit Thank You Card",
    ],
    autoDeducts: [
      { name: "Blue Box", multiplier: 1 },
      { name: "Ribbon",   multiplier: 1 },
    ],
  },
  {
    key: "ball",
    label: "Orbi Ball Teether",
    masterId: null,
    image: "https://res.cloudinary.com/dgqcdiyad/image/upload/f_auto,q_auto/v1784511621/Screenshot_2026-07-20_070916_newhu7.png",
    variants: [
      { key: "ye", label: "Ball Teether Yellow", masterId: "TE-BA-YE-1", colors: ["Orbi Ball Teether Yellow"] },
      { key: "bl", label: "Ball Teether Blue",   masterId: "TE-BA-BL-1", colors: ["Orbi Ball Teether Blue"]   },
    ],
    fixedItems: ["Orbi Ball Teether Box"],
    autoDeducts: [
      { name: "Teether Thank You Card", multiplier: 1 },
      { name: "Potli", multiplier: 1 },
    ],
  },
  {
    key: "mat",
    label: "Sensory Mat",
    masterId: "MA-SE-1",
    image: "https://res.cloudinary.com/dgqcdiyad/image/upload/f_auto,q_auto/v1791794886/amazonthumbnail_vq7snc.png",
    variants: null,
    fixedItems: ["Sensory Mat", "Sensory Mat Thank You Card", "Sensory Mat Box"],
    autoDeducts: [],
  },
  {
    key: "ganesha",
    label: "Ganesha Plushie",
    masterId: "PL-CG-1",
    image: "https://res.cloudinary.com/dgqcdiyad/image/upload/f_auto,q_auto/v1791794873/ganeshaamazonthumbnail_ayiibb.png",
    variants: null,
    fixedItems: ["Ganesha Plushie", "Ganesha Thank You Card", "Ganesha Box"],
    autoDeducts: [],
  },
  {
    key: "potli",
    label: "Potli",
    masterId: null,
    image: null,
    variants: null,
    fixedItems: ["Potli"],
    autoDeducts: [],
  },
  {
    key: "fb-combo",
    label: "High Contrast Flashcard Kit",
    masterId: "FK-HC-2",
    image: "https://res.cloudinary.com/dgqcdiyad/image/upload/q_auto/f_auto/v1779792238/Screenshot_2026-05-26_161340_laoeol.png",
    variants: null,
    fixedItems: [
      { name: "Flashcards", multiplier: 10 },
      "Banner",
      { name: "Ribbon", multiplier: 1 },
      "Flashcard Kit Thank You Card",
      "Flashcard Kit Box",
    ],
    autoDeducts: [],
  },
]

// ── Component → inventory row resolution ──────────────────────────────────
// Match by item_code first (survives renames), then by name ignoring case and
// extra spaces (live data has e.g. "Ganesha Plushie " with a trailing space).
const normName = (s) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase()

export function makeComponentResolver(products = []) {
  const byCode = new Map()
  const byName = new Map()
  products.forEach((p) => {
    if (p.item_code) byCode.set(String(p.item_code).trim().toUpperCase(), p)
    byName.set(normName(p.name), p)
  })
  return (name) => {
    const code = COMPONENT_CODES[name]
    return (code && byCode.get(code)) || byName.get(normName(name)) || null
  }
}

// Every component name the config can deduct (plus Corrugation Box).
export function allComponentNames() {
  const names = new Set(["Corrugation Box"])
  SHIPMENT_PRODUCTS.forEach((p) => {
    p.variants?.forEach((v) => v.colors.forEach((c) => names.add(c)))
    p.fixedItems.forEach((i) => names.add(typeof i === "string" ? i : i.name))
    p.autoDeducts?.forEach((a) => names.add(a.name))
  })
  return [...names]
}

// Components that don't resolve to an inventory row. Shown as a warning so a
// rename is caught before anyone tries to ship.
export function findUnmappedComponents(products = []) {
  if (!products.length) return []
  const resolve = makeComponentResolver(products)
  return allComponentNames().filter((n) => !resolve(n))
}

// Stock for a component name, through the same resolver.
export function makeStockLookup(products = []) {
  const resolve = makeComponentResolver(products)
  return (name) => resolve(name)?.stock ?? 0
}

// Build deductions for a single shipment line (product + variant + qty).
export function buildLineDeductions(productKey, variantKey, qty) {
  const Q = Number(qty)
  const rp = SHIPMENT_PRODUCTS.find((p) => p.key === productKey)
  if (!rp) return []

  const items = []

  if (rp.variants && variantKey) {
    const variant = rp.variants.find((v) => v.key === variantKey)
    if (variant) variant.colors.forEach((name) => items.push({ name, quantity: Q }))
  }

  rp.fixedItems.forEach((item) => {
    if (typeof item === "string") {
      items.push({ name: item, quantity: Q })
    } else {
      items.push({ name: item.name, quantity: Q * item.multiplier })
    }
  })

  if (rp.autoDeducts) {
    rp.autoDeducts.forEach((ad) => items.push({ name: ad.name, quantity: Q * ad.multiplier }))
  }

  return items
}

// Aggregate deductions across all shipment lines (merges duplicate item names).
export function buildAllDeductions(lines) {
  const map = {}
  lines.forEach((line) => {
    buildLineDeductions(line.productKey, line.variantKey, line.qty).forEach(({ name, quantity }) => {
      map[name] = (map[name] || 0) + quantity
    })
  })
  return Object.entries(map).map(([name, quantity]) => ({ name, quantity }))
}

// ── SKU catalogue (one row per shippable SKU) ─────────────────────────────
// code: the master ID shown in the app and used in the Excel template.
// Products with neither a variant nor a master ID fall back to their key.
export function listShippableSkus() {
  const skus = []
  SHIPMENT_PRODUCTS.forEach((p) => {
    if (p.variants?.length) {
      p.variants.forEach((v) => skus.push({
        code: v.masterId || `${p.key}-${v.key}`.toUpperCase(),
        sku_key: p.key,
        variant_key: v.key,
        product: p.label,
        variant: v.label,
        label: `${p.label} — ${v.label}`,
      }))
    } else {
      skus.push({
        code: p.masterId || p.key.toUpperCase(),
        sku_key: p.key,
        variant_key: null,
        product: p.label,
        variant: "",
        label: p.label,
      })
    }
  })
  return skus
}

// Label stored on a consignment line, e.g. "Kiko No Drop Teether — KIKO TEETHER GREEN".
export function lineLabel(productKey, variantKey) {
  const p = SHIPMENT_PRODUCTS.find((x) => x.key === productKey)
  if (!p) return productKey
  const v = p.variants?.find((x) => x.key === variantKey)
  return v ? `${p.label} — ${v.label}` : p.label
}
