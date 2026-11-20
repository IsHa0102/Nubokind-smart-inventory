// Warehouse Google Sheet → inventory stock sync.
//
// The warehouse team records a stock count per date in the "Inventory Data" tab
// (one row per count date, one column per item). The sheet is shared as
// "anyone with the link", so the browser can read it through Google's CSV export
// without credentials. We take the latest counted row and store it next to
// system stock (warehouse_products.sheet_*). Stock itself only changes when a
// person accepts a difference on the Inventory page (sql/005).

export const SHEET_ID = "1zuQaz3j7z3xuefDp4YoZKZlGzvlpD4WI_XBZHBN9LWs"
export const SHEET_GID = "0" // "Inventory Data" tab
export const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=${SHEET_GID}`
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`

// Sheet column header → warehouse item_code. Matched by header text (not column
// position), so the warehouse can insert or reorder columns safely. Headers are
// normalised (case, extra spaces) before lookup. Mapping was verified by
// matching past sheet counts to stock values in the app.
export const SHEET_COLUMN_MAP = {
  "ele green":                     "RI-TE-EL-SG", // Ele Sage Green Teether
  "ele blue":                      "RI-TE-EL-AB", // Ele Aqua Blue Teether
  "ele grey":                      "RI-TE-EL-SL", // Ele Slate Grey Teether
  "ele pink":                      "RI-TE-EL-BP", // Ele Baby Pink Teether
  "ele beige":                     "RI-TE-EL-OB", // Ele Oat Beige Teether
  "koala green":                   "RI-TE-KI-GR", // Kiko Teether Green
  "koala white":                   "RI-TE-KI-WH", // Kiko Teether White
  "koala blue":                    "RI-TE-KI-BL", // Kiko Teether Blue
  "ball teether orbi yellow":      "RI-TE-BA-YE",
  "ball teether orbi blue":        "RI-TE-BA-BL",
  "potli":                         "PK-PTL",
  "ele packet monocarton box":     "PK-BOX-EL",
  "koala monocarton packet box":   "PK-BOX-KI",
  "book patterns":                 "RI-BO-PT",
  "book puzzle":                   "RI-BO-PZ",
  "book faces":                    "RI-BO-FC",
  "book my first":                 "RI-BO-MF",
  "paper banner":                  "RI-HC-BN",
  "red ribbon (rolls)":            "RI-AC-RB",    // app tracks ribbon in rolls too
  "corrugation box":               "PK-BOX-CG",
  "book box blue":                 "PK-BOX-BL",
  "flash card kit box (brown)":    "PK-BOX-FK",
  "ele thank you card":            "PK-CRD-TE",   // shared Teether Thank You Card
  "flashcard kit thank you card":  "PK-CRD-FK",
  "book kit thank you card":       "PK-CRD-BO",
  "sensory kit thank you card":    "PK-CRD-SK",
  "sensory mat thank you card":    "MA-SA-TYC",
  "ganesha toy thank you card":    "PL-CG-TYC",
  "plastic bag for single orders": "PK-PLA",      // Plastic Packaging
  "orbi box":                      "PK-BOX-BA",
  "sensory mat":                   "MA-SA-MAT",
  "sensory matt box":              "MA-SA-BOX",
  "ganesh toy":                    "PL-CG-PLU",
  "ganesh box":                    "PL-CG-BOX",
}

const HEADER_ROW_MARKER = "product count"

const normalise = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ")

// Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF).
export function parseCsv(text) {
  const rows = []
  let row = [], field = "", inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') inQuotes = false
      else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ",") { row.push(field); field = "" }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++
      row.push(field); rows.push(row); row = []; field = ""
    } else field += ch
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row) }
  return rows
}

// A cell is usable only if it is a plain whole number ("1,250" allowed).
// Anything else ("NOT COUNT", "8000+", "13 rolls", "550 damage box") is
// returned as invalid so a person can fix it in the sheet; we never guess.
export function parseCount(raw) {
  const s = String(raw ?? "").trim()
  if (s === "") return { kind: "blank" }
  if (/^\d{1,3}(,\d{3})+$|^\d+$/.test(s)) return { kind: "ok", value: Number(s.replace(/,/g, "")) }
  return { kind: "invalid", raw: s }
}

const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"]

// "18 November" / "15 June 2026" → Date. Without a year, assume the most recent
// such date that is not in the future.
export function parseCountDate(label, today = new Date()) {
  const m = String(label ?? "").trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s*,?\s*(\d{4})?$/)
  if (!m) return null
  const month = MONTHS.findIndex((name) => name.startsWith(m[2].toLowerCase().slice(0, 3)))
  if (month < 0) return null
  let year = m[3] ? Number(m[3]) : today.getFullYear()
  let d = new Date(year, month, Number(m[1]))
  if (!m[3] && d > today) d = new Date(year - 1, month, Number(m[1]))
  return d
}

// Pure: CSV rows + products → sync plan. Kept free of I/O so it can be tested.
export function buildSyncPlan(rows, products, today = new Date()) {
  const headerIdx = rows.findIndex((r) => normalise(r[0]) === HEADER_ROW_MARKER)
  if (headerIdx < 0) throw new Error(`Could not find the "Product Count" header row in the sheet.`)
  const header = rows[headerIdx]

  const byCode = new Map(products.filter((p) => p.item_code).map((p) => [p.item_code, p]))

  const columns = []          // { col, header, product }
  const unlinkedHeaders = []  // sheet columns we don't know
  const missingProducts = []  // mapped item_code not found in app
  header.forEach((h, col) => {
    if (col === 0 || !normalise(h)) return
    const code = SHEET_COLUMN_MAP[normalise(h)]
    if (!code) { unlinkedHeaders.push(h.trim()); return }
    const product = byCode.get(code)
    if (!product) { missingProducts.push(`${h.trim()} → ${code}`); return }
    columns.push({ col, header: h.trim(), product })
  })

  // Latest count = last row (below header) with at least one usable number in a
  // linked column. Pre-filled future date rows with no numbers are skipped.
  let countRow = null
  for (let i = rows.length - 1; i > headerIdx; i--) {
    if (columns.some(({ col }) => parseCount(rows[i][col]).kind === "ok")) { countRow = rows[i]; break }
  }
  if (!countRow) throw new Error("No stock counts found in the sheet yet.")

  const countLabel = String(countRow[0] ?? "").trim() || "(no date)"
  const countDate = parseCountDate(countLabel, today)

  const changes = [], unchanged = [], invalid = [], blank = []
  for (const { col, header: h, product } of columns) {
    const cell = parseCount(countRow[col])
    if (cell.kind === "blank") { blank.push({ header: h, product }); continue }
    if (cell.kind === "invalid") { invalid.push({ header: h, product, raw: cell.raw }); continue }
    const current = Number(product.stock ?? 0)
    const row = { header: h, product, current, next: cell.value, diff: cell.value - current }
    ;(row.diff === 0 ? unchanged : changes).push(row)
  }

  return { countLabel, countDate, changes, unchanged, invalid, blank, unlinkedHeaders, missingProducts }
}

// Every linked item in the latest count, shaped for warehouse_record_sheet_counts().
// Blank / non-numeric cells are sent as stock null, which clears an older count
// so it can't be compared as if it were current. One row per item (two sheet
// columns mapped to the same item: the last one wins).
export function sheetCountsFromPlan(plan) {
  const d = plan.countDate
  const date = d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    : null
  const byId = new Map()
  for (const c of [...plan.changes, ...plan.unchanged]) byId.set(c.product.id, c.next)
  for (const c of [...plan.blank, ...plan.invalid]) if (!byId.has(c.product.id)) byId.set(c.product.id, null)
  return [...byId].map(([product_id, stock]) => ({ product_id, stock, label: plan.countLabel, date }))
}

export async function fetchSheetRows() {
  let res
  try {
    res = await fetch(CSV_URL, { cache: "no-store" })
  } catch {
    throw new Error("Could not reach Google Sheets. Check your connection.")
  }
  if (!res.ok) throw new Error(`Google Sheets returned ${res.status}. Is the sheet still shared as "anyone with the link"?`)
  const text = await res.text()
  if (text.trimStart().startsWith("<")) {
    throw new Error(`Google returned a login page. The sheet must be shared as "anyone with the link can view".`)
  }
  return parseCsv(text)
}
