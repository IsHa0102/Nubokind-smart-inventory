// Consignment Excel template — one consignment per file.
//
// Sheet "Consignment":
//   rows 1-7   header fields (label in column A, value in column B)
//   row 9      table header: SKU Code | Product | Variant | Quantity
//   rows 10+   every shippable SKU, pre-filled; the team types quantities only.
// Sheet "Destinations": the destination names the app accepts.
// Sheet "How to fill": instructions.
//
// Parsing finds fields by their label and the table by its "SKU Code" header,
// so moving rows around or deleting unused SKU rows doesn't break an upload.

import { buildXlsx, downloadBlob, readXlsx, excelSerialToISO } from "./xlsx"
import { listShippableSkus } from "./shipmentConfig"

const FIELD_LABELS = {
  dispatch_date: "Dispatch Date",
  destination: "Destination",
  reference: "Reference / AWB",
  corrugation_boxes: "Corrugation Boxes Used",
  notes: "Notes",
}

const B = (v) => ({ v, bold: true })

export function downloadConsignmentTemplate(destinations = [], prefill = null) {
  const skus = listShippableSkus()
  const qtyBySku = {}
  ;(prefill?.lines || []).forEach((l) => {
    qtyBySku[`${l.sku_key}|${l.variant_key || ""}`] = l.quantity
  })

  const consignmentRows = [
    [B("NUBOKIND CONSIGNMENT")],
    [B(FIELD_LABELS.dispatch_date), prefill?.dispatch_date || "", "Format: YYYY-MM-DD, e.g. 2026-11-06"],
    [B(FIELD_LABELS.destination), prefill?.destination || "", "Must match a name on the Destinations sheet"],
    [B(FIELD_LABELS.reference), prefill?.reference || "", "Optional — AWB, PO or shipment ID"],
    [B(FIELD_LABELS.corrugation_boxes), prefill?.corrugation_boxes ?? "", "Number of outer cartons used"],
    [B(FIELD_LABELS.notes), prefill?.notes || ""],
    [],
    [],
    [B("SKU Code"), B("Product"), B("Variant"), B("Quantity")],
    ...skus.map((s) => [s.code, s.product, s.variant, qtyBySku[`${s.sku_key}|${s.variant_key || ""}`] ?? ""]),
  ]

  const blob = buildXlsx([
    { name: "Consignment", rows: consignmentRows, colWidths: [26, 36, 28, 44] },
    {
      name: "Destinations",
      rows: [[B("Destination")], ...destinations.map((d) => [d.name])],
      colWidths: [40],
    },
    {
      name: "How to fill",
      colWidths: [100],
      rows: [
        [B("How to fill this consignment template")],
        ["1. One file = one consignment."],
        ["2. Fill Dispatch Date, Destination and Corrugation Boxes Used at the top of the Consignment sheet."],
        ["3. Type the number of units in the Quantity column for each SKU being shipped. Leave the rest blank."],
        ["4. Don't change the SKU Code column — the app matches rows by that code."],
        ["5. Save the file and upload it on the Stock Entry → Shipment or Consignments page."],
        ["6. The app shows every component it will deduct before anything is saved."],
      ],
    },
  ])

  const stamp = prefill?.id ? `consignment-${prefill.id}` : `consignment-template-${new Date().toISOString().slice(0, 10)}`
  downloadBlob(blob, `${stamp}.xlsx`)
}

const norm = (v) => String(v ?? "").trim().toLowerCase()

function toISODate(v) {
  if (v === null || v === undefined || v === "") return ""
  if (typeof v === "number") return excelSerialToISO(v)
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s)    // 06/11/2026 (Indian order)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`
  return null
}

// Returns { destination, dispatch_date, reference, notes, corrugation_boxes, lines, errors }.
// lines: [{ sku_key, variant_key, quantity, label }]. errors: string[] — if any
// are present the caller should show them and not save.
export async function parseConsignmentFile(file, destinations = []) {
  if (!/\.xlsx$/i.test(file.name)) {
    return { errors: ["Please upload the .xlsx template (Excel workbook). Older .xls and .csv files aren't supported."] }
  }

  let sheets
  try {
    sheets = await readXlsx(await file.arrayBuffer())
  } catch (e) {
    return { errors: [e.message || "Could not read this file."] }
  }

  const rows = sheets.Consignment || Object.values(sheets)[0] || []
  const errors = []

  const field = (label) => {
    const row = rows.find((r) => norm(r?.[0]) === norm(label))
    return row ? row[1] : null
  }

  // Header fields
  const rawDest = field(FIELD_LABELS.destination)
  const dest = destinations.find((d) => norm(d.name) === norm(rawDest))
  if (!norm(rawDest)) errors.push("Destination is empty.")
  else if (!dest) errors.push(`Destination "${rawDest}" isn't in the app. Use a name from the Destinations sheet, or add it in Admin first.`)

  const dispatch_date = toISODate(field(FIELD_LABELS.dispatch_date))
  if (dispatch_date === null) errors.push("Dispatch Date isn't a date. Use YYYY-MM-DD, e.g. 2026-11-06.")

  const rawCorr = field(FIELD_LABELS.corrugation_boxes)
  const corrugation_boxes = rawCorr === null || rawCorr === "" ? null : Number(rawCorr)
  if (corrugation_boxes !== null && (!Number.isInteger(corrugation_boxes) || corrugation_boxes < 0)) {
    errors.push("Corrugation Boxes Used must be a whole number.")
  }

  // SKU table
  const headerIdx = rows.findIndex((r) => norm(r?.[0]) === "sku code")
  if (headerIdx < 0) {
    errors.push('Couldn\'t find the "SKU Code" table. Download a fresh template and fill that in.')
    return { errors }
  }
  const qtyCol = rows[headerIdx].findIndex((c) => norm(c) === "quantity")

  const byCode = Object.fromEntries(listShippableSkus().map((s) => [norm(s.code), s]))
  const merged = {}
  rows.slice(headerIdx + 1).forEach((r, i) => {
    const code = norm(r?.[0])
    const rawQty = r?.[qtyCol < 0 ? 3 : qtyCol]
    if (!code || rawQty === null || rawQty === undefined || rawQty === "") return
    const qty = Number(rawQty)
    const rowNo = headerIdx + i + 2
    if (!Number.isInteger(qty) || qty < 0) { errors.push(`Row ${rowNo}: quantity "${rawQty}" isn't a whole number.`); return }
    if (qty === 0) return
    const sku = byCode[code]
    if (!sku) { errors.push(`Row ${rowNo}: SKU code "${r[0]}" isn't recognised.`); return }
    const key = `${sku.sku_key}|${sku.variant_key || ""}`
    merged[key] = merged[key]
      ? { ...merged[key], quantity: merged[key].quantity + qty }
      : { sku_key: sku.sku_key, variant_key: sku.variant_key, quantity: qty, label: sku.label }
  })

  const lines = Object.values(merged)
  if (lines.length === 0 && errors.length === 0) errors.push("No quantities filled in — enter units against at least one SKU.")

  return {
    destination: dest?.name ?? "",
    dispatch_date: dispatch_date || "",
    reference: String(field(FIELD_LABELS.reference) ?? "").trim(),
    notes: String(field(FIELD_LABELS.notes) ?? "").trim(),
    corrugation_boxes,
    lines,
    errors,
  }
}
