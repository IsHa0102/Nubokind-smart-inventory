// Challan line → shippable SKU. Pure; the caller passes the lookup tables.
//
// Strongest signal first:
//   1. platform item code with a known mapping   (Blinkit item 10331986 → TE-EL-BL-PI-2)
//   2. master ID printed in the description      ("[BO-HC-3]", legacy "[TEE-KIK-GREEN]")
//   3. a match a person confirmed before          (warehouse_challan_aliases)
//   4. keywords + colours in the description      ("Koala … Sky Blue" → Kiko Blue)
// Only 1–3 are trusted outright. Keyword guesses, and any line whose variant
// can't be told from the text (Amazon's "Ring Set | Pack of 2" titles carry no
// colour), are flagged for a person to check before anything is saved.

import { SHIPMENT_PRODUCTS, listShippableSkus } from "../shipmentConfig.js"

// Old Blinkit / marketplace codes still printed on some documents.
const LEGACY_CODES = {
  "TEE-ELE-BLUE-GREEN": "TE-EL-BL-GR-2",
  "TEE-KIK-GREEN": "TE-KI-GR-1",
  "TEE-KIK-WHITE": "TE-KI-WH-1",
  "TEE-KIK-BLUE": "TE-KI-BL-1",
}

export const normaliseDescription = (s) =>
  String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 300)

export const aliasKeys = (row) => [
  row.itemCode ? `code:${row.itemCode}` : null,
  `desc:${normaliseDescription(row.description)}`,
].filter(Boolean)

const skuByCode = () => new Map(listShippableSkus().map((s) => [s.code.toUpperCase(), s]))

// ── Keyword rules ───────────────────────────────────────────────────────────
// Order matters: "High Contrast Sensory Kit" must win over "flashcards", and
// Kiko ("Koala Wrist-Fit … Teether") over the generic Ele "teether ring".
const PRODUCT_RULES = [
  { sku: "mat",      re: /sensory mat|play mat|baby mat/ },
  { sku: "newborn",  re: /sensory kit|montessori|gift set|learning kit/ },
  { sku: "fb-combo", re: /flash ?cards?|flashcard/ },
  { sku: "cloth",    re: /book ?set|cloth book|soft books?/ },
  { sku: "ganesha",  re: /ganesh/ },
  { sku: "kiko",     re: /koala|kiko|wrist|no ?drop/ },
  { sku: "ball",     re: /\bball\b|orbi/ },
  { sku: "ele",      re: /elephant|\bele\b|ring set|teether ring|ring silicone/ },
  { sku: "potli",    re: /potli/ },
]

// Colour words → the warehouse colour component each variant is built from.
const COLOUR_WORDS = {
  ele: [
    [/sage|green/, "Ele Sage Green Teether"],
    [/aqua|blue/, "Ele Aqua Blue Teether"],
    [/pink/, "Ele Baby Pink Teether"],
    [/beige|oat/, "Ele Oat Beige Teether"],
    [/grey|gray|slate/, "Ele Slate Grey Teether"],
  ],
  kiko: [
    [/sage|green/, "Kiko Teether Green"],
    [/white|cloud/, "Kiko Teether White"],
    [/blue|sky/, "Kiko Teether Blue"],
  ],
  ball: [
    [/yellow|mustard/, "Orbi Ball Teether Yellow"],
    [/blue|navy/, "Orbi Ball Teether Blue"],
  ],
}

function variantFromColours(skuKey, text) {
  const product = SHIPMENT_PRODUCTS.find((p) => p.key === skuKey)
  if (!product?.variants) return { variant_key: null, candidates: [] }
  const found = new Set((COLOUR_WORDS[skuKey] || []).filter(([re]) => re.test(text)).map(([, c]) => c))
  const exact = product.variants.filter(
    (v) => v.colors.length === found.size && v.colors.every((c) => found.has(c))
  )
  if (exact.length === 1) return { variant_key: exact[0].key, candidates: [] }
  const partial = found.size
    ? product.variants.filter((v) => [...found].every((c) => v.colors.includes(c)))
    : product.variants
  return { variant_key: null, candidates: partial.map((v) => v.key) }
}

const fromSku = (sku, confidence, reason) => ({
  sku_key: sku.sku_key, variant_key: sku.variant_key, confidence, reason, candidates: [],
})

// row: { description, quantity, itemCode }
// ctx: { platform, blinkitMap: Map<itemId, masterId>, aliases: Map<"platform|key", {sku_key, variant_key}> }
// → { sku_key, variant_key, confidence: "exact"|"learned"|"guess"|"partial"|"none", reason, candidates }
export function matchRow(row, ctx = {}) {
  const codes = skuByCode()
  const desc = String(row.description || "")

  // 1. Platform item code
  if (row.itemCode && ctx.blinkitMap?.has(row.itemCode)) {
    const master = String(ctx.blinkitMap.get(row.itemCode)).toUpperCase()
    const sku = codes.get(master)
    if (sku) return fromSku(sku, "exact", `Blinkit item ${row.itemCode} → ${master}`)
  }

  // 2. Master ID in the text, e.g. "[TE-EL-BL-PI-2]"
  for (const m of desc.toUpperCase().matchAll(/\[?\b([A-Z]{2,3}(?:-[A-Z0-9]{1,6}){1,4})\b\]?/g)) {
    const code = LEGACY_CODES[m[1]] || m[1]
    const sku = codes.get(code)
    if (sku) return fromSku(sku, "exact", `Code ${m[1]} on the challan`)
  }

  // 3. Confirmed before
  for (const key of aliasKeys(row)) {
    const hit = ctx.aliases?.get(`${ctx.platform}|${key}`)
    if (hit) {
      return {
        sku_key: hit.sku_key, variant_key: hit.variant_key ?? null, confidence: "learned",
        reason: "Matched like last time", candidates: [],
      }
    }
  }

  // 4. Keywords
  const text = normaliseDescription(desc)
  const rule = PRODUCT_RULES.find((r) => r.re.test(text))
  if (!rule) return { sku_key: null, variant_key: null, confidence: "none", reason: "No product recognised", candidates: [] }

  const product = SHIPMENT_PRODUCTS.find((p) => p.key === rule.sku)
  if (!product.variants) {
    return { sku_key: rule.sku, variant_key: null, confidence: "guess", reason: `Looks like ${product.label}`, candidates: [] }
  }
  const { variant_key, candidates } = variantFromColours(rule.sku, text)
  if (variant_key) {
    return { sku_key: rule.sku, variant_key, confidence: "guess", reason: `Looks like ${product.label}, colour from text`, candidates: [] }
  }
  return {
    sku_key: rule.sku, variant_key: null, confidence: "partial",
    reason: `${product.label} — colour not on the challan, pick the variant`, candidates,
  }
}

// What a confirmed challan should teach. Only choices a person actually made:
//   • exact / remembered / untouched keyword matches teach nothing new;
//   • a colour picked for a title that names no colour ("partial") is NOT
//     learned — Amazon uses that same title for every colour, so remembering
//     it would silently ship the wrong colour next time;
//   • identical text mapped to different SKUs within one challan is ambiguous
//     and not learned either.
export function aliasesToLearn(platform, resolvedRows) {
  const byKey = new Map()
  for (const r of resolvedRows) {
    const m = r.match || {}
    if (!r.sku_key || m.confidence === "exact" || m.confidence === "partial") continue
    const changed = r.sku_key !== m.sku_key || (r.variant_key || null) !== (m.variant_key || null)
    if (!changed) continue
    for (const key of aliasKeys(r)) {
      const val = { sku_key: r.sku_key, variant_key: r.variant_key || null }
      const prev = byKey.get(key)
      if (prev === undefined) byKey.set(key, val)
      else if (prev && (prev.sku_key !== val.sku_key || prev.variant_key !== val.variant_key)) byKey.set(key, null)
    }
  }
  return [...byKey.entries()]
    .filter(([, v]) => v)
    .map(([match_key, v]) => ({ platform, match_key, ...v }))
}
