// Shared shipment product configuration — used by StockEntryPage and PlannedShipmentsPage.

export const SHIPMENT_PRODUCTS = [
  {
    key: "ele",
    label: "Ele Ring Silicone Teether Set",
    masterId: null,
    image: "https://res.cloudinary.com/dgqcdiyad/image/upload/f_auto,q_auto/ele-teether-blue-beige__wljswi",
    variants: [
      { key: "sg_ab", label: "ELE TEETHER BLUE GREEN",  masterId: "TE-EL-BL-GR-2", colors: ["Ele Sage Green Teether", "Ele Aqua Blue Teether"] },
      { key: "bp_ob", label: "ELE TEETHER BEIGE PINK",  masterId: "TE-EL-BE-PI-2", colors: ["Ele Baby Pink Teether", "Ele Oat Beige Teether"] },
      { key: "sg_sg", label: "ELE TEETHER GREEN GREY",  masterId: "TE-EL-GR-GY-2", colors: ["Ele Sage Green Teether", "Ele Slate Grey Teether"] },
      { key: "ab_ob", label: "ELE TEETHER BEIGE BLUE",  masterId: "TE-EL-BE-BL-2", colors: ["Ele Aqua Blue Teether", "Ele Oat Beige Teether"] },
      { key: "ab_bp", label: "ELE TEETHER BLUE PINK",   masterId: "TE-EL-BL-PI-2", colors: ["Ele Aqua Blue Teether", "Ele Baby Pink Teether"] },
      { key: "sg_ob", label: "ELE TEETHER BEIGE GREEN", masterId: "TE-EL-BE-GR-2", colors: ["Ele Sage Green Teether", "Ele Oat Beige Teether"] },
      { key: "sg_bp", label: "ELE TEETHER GREEN PINK",  masterId: "TE-EL-GR-PI-2", colors: ["Ele Sage Green Teether", "Ele Baby Pink Teether"] },
    ],
    fixedItems: ["Ele Box"],
    autoDeducts: [{ name: "Teether Thank You Card", multiplier: 1 }],
  },
  {
    key: "kiko",
    label: "Kiko No Drop Teether",
    masterId: null,
    image: "https://res.cloudinary.com/dgqcdiyad/image/upload/f_auto,q_auto/kiko_teether_baby_hand_green_b23ujn",
    variants: [
      { key: "sg", label: "KIKO TEETHER GREEN", masterId: "TE-KI-GR-1", colors: ["Kiko Teether Green"] },
      { key: "cw", label: "KIKO TEETHER WHITE", masterId: "TE-KI-WH-1", colors: ["Kiko Teether White"] },
      { key: "bl", label: "KIKO TEETHER BLUE",  masterId: "TE-KI-BL-1", colors: ["Kiko Teether Blue"]  },
    ],
    fixedItems: ["Kiko Box"],
    autoDeducts: [
      { name: "Teether Thank You Card", multiplier: 1 },
      { name: "Potli", multiplier: 1 },
    ],
  },
  {
    key: "cloth",
    label: "HIGH CONTRAST BOOKSET",
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
    label: "HIGH CONTRAST SENSORY KIT",
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
    label: "Ball Teether",
    masterId: null,
    image: "https://res.cloudinary.com/dgqcdiyad/image/upload/f_auto,q_auto/v1784511621/Screenshot_2026-07-20_070916_newhu7.png",
    variants: [
      { key: "ye", label: "BALL TEETHER YELLOW", masterId: "TE-BA-YE-1", colors: ["Ball Teether Yellow"] },
      { key: "bl", label: "BALL TEETHER BLUE",   masterId: "TE-BA-BL-1", colors: ["Ball Teether Blue"]   },
    ],
    fixedItems: ["Ball Teether Box"],
    autoDeducts: [
      { name: "Ball Teether Thank You Card", multiplier: 1 },
      { name: "Potli", multiplier: 1 },
    ],
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
    label: "HIGH CONTRAST FLASHCARD KIT",
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
