// Delivery challan PDF → consignment draft. Pure functions, no I/O: the input
// is the positioned text pdf.js gives us ([{ page, x, y, w, str }], y grows
// upwards), so this runs the same in the browser and in Node tests.
//
// Supported layouts (samples in server/uploads):
//   amazon   — FBA "Delivery Challan / Tax Invoice"   (Sno | Product Description | Qty …)
//   blinkit  — Seller Hub "Recommended Quantity Order" (# | Item Code | … | Product Description | … | Qty.)
//   eshopbox — our own website challan "DC031"        (Product ID* | Quantity* | Cost/unit)
//
// The table reader is layout-driven rather than per-platform: it finds the
// header row by its Qty column, derives column x-ranges from the header cells,
// anchors one row on every whole number in the Qty column, and collects each
// row's description from the description column down to the next anchor. That
// copes with multi-line descriptions and tables that continue on a new page.

const LINE_TOLERANCE = 3   // points; items this close vertically share a line

// ── Text layout helpers ─────────────────────────────────────────────────────
// Reading order: page, then top to bottom, then left to right.
const byReadingOrder = (a, b) => a.page - b.page || b.y - a.y || a.x - b.x

// Join items on one line. Fragments that touch ("DC" "03" "1") are glued;
// anything with a visible gap gets a space.
function joinLine(items) {
  let out = ""
  let prevEnd = null
  for (const it of [...items].sort((a, b) => a.x - b.x)) {
    if (prevEnd !== null) out += it.x - prevEnd > 1.5 ? " " : ""
    out += it.str
    prevEnd = it.x + (it.w || 0)
  }
  return out.replace(/\s+/g, " ").trim()
}

export function groupLines(items) {
  const sorted = [...items].filter((i) => i.str.trim()).sort(byReadingOrder)
  const lines = []
  for (const it of sorted) {
    const last = lines[lines.length - 1]
    if (last && last.page === it.page && Math.abs(last.y - it.y) <= LINE_TOLERANCE) last.items.push(it)
    else lines.push({ page: it.page, y: it.y, items: [it] })
  }
  return lines.map((l) => ({ ...l, text: joinLine(l.items) }))
}

// Multi-line cell text → one string. A line ending in "-" continues the word
// or code on the next line: "[TEE-ELE-" + "BLUE-" + "GREEN]" → "[TEE-ELE-BLUE-GREEN]".
function joinCellLines(lineTexts) {
  return lineTexts.reduce((acc, t) => (!acc ? t : acc.endsWith("-") ? acc + t : `${acc} ${t}`), "")
}

// ── Table extraction ────────────────────────────────────────────────────────
const QTY_HEADER = /^(qty\.?|quantity\*?)$/i
const isWholeNumber = (s) => /^\d{1,3}(,\d{3})+$|^\d+$/.test(s.trim())

function findColumns(items) {
  const qty = [...items].sort(byReadingOrder).find((i) => QTY_HEADER.test(i.str.trim()))
  if (!qty) return null

  // Header cells = tokens on the Qty token's line, merged when they touch.
  const top = items
    .filter((i) => i.page === qty.page && Math.abs(i.y - qty.y) <= LINE_TOLERANCE && i.str.trim())
    .sort((a, b) => a.x - b.x)
  const cells = []
  for (const it of top) {
    const last = cells[cells.length - 1]
    if (last && it.x - (last.x + last.w) < 4) { last.label += ` ${it.str.trim()}`; last.w = it.x + it.w - last.x }
    else cells.push({ x: it.x, w: it.w || 0, label: it.str.trim() })
  }
  // Add second-line header words directly underneath ("Product" / "Description").
  for (const c of cells) {
    const below = items
      .filter((i) => i.page === qty.page && Math.abs(i.x - c.x) <= 3 && i.y < qty.y - LINE_TOLERANCE && i.y >= qty.y - 15)
      .filter((i) => i.str.trim() && !isWholeNumber(i.str))
      .sort((a, b) => b.y - a.y)
    if (below.length) c.label += ` ${below.map((i) => i.str.trim()).join(" ")}`
  }
  const columns = cells.map((c, i) => ({
    label: c.label.toLowerCase().replace(/\s+/g, " "),
    from: c.x - 3,
    to: i + 1 < cells.length ? cells[i + 1].x - 3 : Infinity,
  }))

  const pick = (re) => columns.find((c) => re.test(c.label))
  return {
    page: qty.page,
    y: qty.y,
    qty: columns.find((c) => QTY_HEADER.test(c.label.split(" ")[0])) || pick(/qty|quantity/),
    desc: pick(/description/) || pick(/product|item name|particulars/),
    code: pick(/item code/),
  }
}

const inCol = (col, it) => col && it.x >= col.from && it.x < col.to
const after = (it, page, y) => it.page > page || (it.page === page && it.y < y)

export function extractTable(items) {
  const cols = findColumns(items)
  if (!cols || !cols.desc) return { rows: [], error: "Couldn't find the item table (no Qty / Product column)." }

  const body = items
    .filter((i) => i.str.trim() && after(i, cols.page, cols.y - LINE_TOLERANCE))
    .sort(byReadingOrder)

  // Table ends at the first "Total …" after the header.
  const end = body.find((i) => /^total\b/i.test(i.str.trim()))
  const beforeEnd = (i) => !end || i.page < end.page || (i.page === end.page && i.y > end.y + LINE_TOLERANCE)
  const tableItems = body.filter(beforeEnd)

  const anchors = tableItems.filter((i) => inCol(cols.qty, i) && isWholeNumber(i.str))
  const rows = anchors.map((a, k) => {
    const next = anchors[k + 1]
    const top = a.y + 4                                             // description may sit a little above the qty
    const bottom = next && next.page === a.page ? next.y + 4 : -Infinity
    const region = tableItems.filter((i) => i.page === a.page && i.y <= top && i.y > bottom)
    const descLines = groupLines(region.filter((i) => inCol(cols.desc, i))).map((l) => l.text)
    const code = cols.code
      ? region.filter((i) => inCol(cols.code, i)).sort(byReadingOrder).map((i) => i.str.trim()).join("")
      : ""
    return {
      description: joinCellLines(descLines),
      quantity: Number(a.str.replace(/,/g, "")),
      itemCode: /^\d+$/.test(code) ? code : "",
    }
  }).filter((r) => r.description && r.quantity > 0)

  // Printed total on the "Total" line, when the Qty column carries one (Amazon).
  const totalToken = end && body.find((i) =>
    i.page === end.page && Math.abs(i.y - end.y) <= LINE_TOLERANCE && inCol(cols.qty, i) && isWholeNumber(i.str))
  const printedTotal = totalToken ? Number(totalToken.str.replace(/,/g, "")) : null

  return { rows, printedTotal, error: rows.length ? null : "Found the table but no item rows in it." }
}

// ── Header fields ──────────────────────────────────────────────────────────
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
const pad = (n) => String(n).padStart(2, "0")
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`

function monthIndex(name) {
  const i = MONTHS.indexOf(String(name).slice(0, 3).toLowerCase())
  return i < 0 ? null : i + 1
}

// "11/19/2026" — Amazon prints month first. Fall back to day-first when the
// first part can't be a month.
function parseSlashDate(s) {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s)
  if (!m) return ""
  const [a, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  return a > 12 ? iso(y, b, a) : iso(y, a, b)
}

export function detectPlatform(text) {
  if (/FBA Shipment ID|\bFBA[0-9A-Z]{8,}\b/i.test(text)) return "amazon"
  if (/blinkit|BLINK COMMERCE|Recommended Quantity Order/i.test(text)) return "blinkit"
  if (/delivery challan\s*#/i.test(text)) return "eshopbox"
  return null
}

export const PLATFORM_LABEL = {
  amazon: "Amazon FBA",
  blinkit: "Blinkit",
  eshopbox: "Website (eShopbox)",
}

function headerFields(platform, text) {
  const grab = (re) => re.exec(text)?.[1]?.trim() || ""
  const f = { reference: "", challanDate: "", boxes: null, hints: [] }

  if (platform === "amazon") {
    f.reference = grab(/FBA Shipment ID\s*:?\s*([A-Z0-9]+)/i) || grab(/Document Number\s*:?\s*([A-Z0-9]+)/i)
    f.challanDate = parseSlashDate(grab(/Document Date\s*:?\s*([\d/]+)/i))
    const boxes = grab(/Number of box(?:es)?\s*:?\s*(\d+)/i)
    f.boxes = boxes ? Number(boxes) : null
  } else if (platform === "blinkit") {
    f.reference = grab(/R\.?O\.? Number\s*:?\s*(\d+)/i)
    const d = /\bDate\s*:\s*([A-Za-z]{3})[a-z]*\.?\s*(\d{1,2}),\s*(\d{4})/.exec(text)
    if (d && monthIndex(d[1])) f.challanDate = iso(d[3], monthIndex(d[1]), d[2])
    f.hints.push("Blinkit's R.O. date is when the order was raised — set the dispatch date to your appointment day.")
  } else if (platform === "eshopbox") {
    const ref = grab(/Delivery challan\s*#\s*:?\s*([A-Z]*\s*\d+)/i)
    f.reference = ref.replace(/\s+/g, "")
    const d = /Order date\s*:?\s*(\d{1,2})\s*([A-Za-z]{3})[a-z]*\s*,?\s*(\d{4})/i.exec(text)
    if (d && monthIndex(d[2])) f.challanDate = iso(d[3], monthIndex(d[2]), d[1])
    const by = /Delivery by\s*:?\s*(\d{1,2})\s*([A-Za-z]{3})[a-z]*\s*,?\s*(\d{4})/i.exec(text)
    if (by) f.hints.push(`Challan says delivery by ${by[1]} ${by[2]} ${by[3]}.`)
  }
  return f
}

// Destination row in the app for a platform. Names are matched loosely so a
// rename like "amazon warehouse" → "Amazon FBA" keeps working.
export function guessDestination(platform, text, destinations = []) {
  const find = (re, not) => destinations.find((d) => re.test(d.name) && !(not && not.test(d.name)))
  if (platform === "amazon") return find(/amazon/i)
  if (platform === "blinkit") return find(/blinkit/i)
  if (platform === "eshopbox") {
    const mumbai = /mumbai|maharashtra|bhiwandi/i.test(text)
    return mumbai ? find(/eshop.*mumbai/i) || find(/eshop/i) : find(/eshop/i, /mumbai/i) || find(/eshop/i)
  }
  return null
}

// items → { platform, reference, challanDate, boxes, hints, rows, error }
export function parseChallanItems(items) {
  const text = groupLines(items).map((l) => l.text).join("\n")
  const platform = detectPlatform(text)
  const table = extractTable(items)
  const fields = headerFields(platform, text)

  // Cross-check against the total printed on the challan, so a row the reader
  // missed (odd page break, unusual layout) is caught before anything is saved.
  const printed = table.printedTotal ?? (Number(/Total Quantity\s*:?\s*([\d,]+)/i.exec(text)?.[1]?.replace(/,/g, "")) || null)
  const read = table.rows.reduce((s, r) => s + r.quantity, 0)
  if (printed !== null && printed !== read && table.rows.length) {
    fields.hints.unshift(`⚠ The challan's total is ${printed} units but ${read} were read. Check for a missing or extra line.`)
  }

  return {
    platform,
    text,
    ...fields,
    printedTotal: printed,
    rows: table.rows,
    error: table.error || (platform ? null : "Couldn't tell which platform this challan is from."),
  }
}
