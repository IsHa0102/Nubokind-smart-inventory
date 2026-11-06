// Minimal, dependency-free .xlsx writer + reader.
//
// An .xlsx file is a zip of XML parts. Writing uses an uncompressed ("stored")
// zip, which Excel, Google Sheets and LibreOffice all open. Reading handles the
// deflate-compressed zips those apps save, using the browser's built-in
// DecompressionStream. Only what consignment templates need is supported:
// text and number cells, bold header cells, column widths, multiple sheets.

// ── Shared helpers ─────────────────────────────────────────────────────────
const enc = new TextEncoder()
const dec = new TextDecoder()

const escapeXml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

const unescapeXml = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")

const colName = (i) => {
  let s = ""
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

const colIndex = (letters) =>
  [...letters].reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1

// ── CRC32 (needed by the zip format) ───────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// ── Zip (store only) ───────────────────────────────────────────────────────
function zipStore(files) {
  const chunks = []
  const central = []
  let offset = 0

  for (const { name, data } of files) {
    const nameBytes = enc.encode(name)
    const crc = crc32(data)

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)          // version needed
    local.setUint16(6, 0x0800, true)      // UTF-8 names
    local.setUint16(8, 0, true)           // method: store
    local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true)
    local.setUint32(22, data.length, true)
    local.setUint16(26, nameBytes.length, true)
    chunks.push(new Uint8Array(local.buffer), nameBytes, data)

    const cen = new DataView(new ArrayBuffer(46))
    cen.setUint32(0, 0x02014b50, true)
    cen.setUint16(4, 20, true)
    cen.setUint16(6, 20, true)
    cen.setUint16(8, 0x0800, true)
    cen.setUint32(16, crc, true)
    cen.setUint32(20, data.length, true)
    cen.setUint32(24, data.length, true)
    cen.setUint16(28, nameBytes.length, true)
    cen.setUint32(42, offset, true)
    central.push(new Uint8Array(cen.buffer), nameBytes)

    offset += 30 + nameBytes.length + data.length
  }

  const cenSize = central.reduce((s, c) => s + c.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, cenSize, true)
  end.setUint32(16, offset, true)

  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}

// ── Writer ─────────────────────────────────────────────────────────────────
// sheets: [{ name, rows: [[cell, ...], ...], colWidths?: [number, ...] }]
// cell:   string | number | null | { v: string|number, bold?: boolean }
export function buildXlsx(sheets) {
  const sheetXml = sheets.map(({ rows, colWidths }) => {
    const cols = colWidths?.length
      ? `<cols>${colWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
      : ""
    const body = rows
      .map((row, r) => {
        const cells = row
          .map((cell, c) => {
            if (cell === null || cell === undefined || cell === "") return ""
            const { v, bold } = typeof cell === "object" ? cell : { v: cell }
            const ref = `${colName(c)}${r + 1}`
            const s = bold ? ' s="1"' : ""
            return typeof v === "number"
              ? `<c r="${ref}"${s}><v>${v}</v></c>`
              : `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(v)}</t></is></c>`
          })
          .join("")
        return `<row r="${r + 1}">${cells}</row>`
      })
      .join("")
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${body}</sheetData></worksheet>`
  })

  const files = [
    {
      name: "[Content_Types].xml",
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
</Types>`,
    },
    {
      name: "_rels/.rels",
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>
</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("\n")}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    {
      name: "xl/styles.xml",
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`,
    },
    ...sheetXml.map((xml, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, xml })),
  ]

  return zipStore(files.map(({ name, xml }) => ({ name, data: enc.encode(xml) })))
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── Zip reader ─────────────────────────────────────────────────────────────
async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function unzip(buffer) {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)

  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error("This file is not a valid .xlsx workbook.")

  const count = view.getUint16(eocd + 10, true)
  let p = view.getUint32(eocd + 16, true)
  const out = {}

  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error("Corrupt .xlsx file.")
    const method = view.getUint16(p + 10, true)
    const compSize = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const localOff = view.getUint32(p + 42, true)
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + extraLen + commentLen

    const lNameLen = view.getUint16(localOff + 26, true)
    const lExtraLen = view.getUint16(localOff + 28, true)
    const start = localOff + 30 + lNameLen + lExtraLen
    const raw = bytes.subarray(start, start + compSize)

    if (method === 0) out[name] = raw
    else if (method === 8) out[name] = await inflateRaw(raw)
    // other methods never appear in spreadsheet files; skip silently
  }
  return out
}

// ── Reader ─────────────────────────────────────────────────────────────────
// Returns { [sheetName]: rows } where rows is an array of arrays of
// string | number | null. Dates come back as Excel serial numbers.
export async function readXlsx(buffer) {
  const files = await unzip(buffer)
  const text = (name) => (files[name] ? dec.decode(files[name]) : null)

  const textOf = (xml) =>
    unescapeXml([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""))

  const shared = []
  const ssXml = text("xl/sharedStrings.xml")
  if (ssXml) for (const m of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]))

  const wbXml = text("xl/workbook.xml")
  const relsXml = text("xl/_rels/workbook.xml.rels") || ""
  if (!wbXml) throw new Error("This file is not a valid .xlsx workbook.")

  const targets = {}
  for (const m of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = /Id="([^"]+)"/.exec(m[1])?.[1]
    const target = /Target="([^"]+)"/.exec(m[1])?.[1]
    if (id && target) targets[id] = target.startsWith("/") ? target.slice(1) : `xl/${target}`
  }

  const result = {}
  for (const m of wbXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = unescapeXml(/name="([^"]*)"/.exec(m[1])?.[1] ?? "")
    const rid = /r:id="([^"]+)"/.exec(m[1])?.[1]
    const xml = text(targets[rid])
    if (!xml) continue

    const rows = []
    for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const rIdx = Number(/\br="(\d+)"/.exec(rm[1])?.[1] ?? rows.length + 1) - 1
      const row = []
      for (const cm of (rm[2] || "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cm[1]
        const inner = cm[2] || ""
        const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1]
        const cIdx = ref ? colIndex(ref) : row.length
        const type = /\bt="([^"]+)"/.exec(attrs)?.[1]
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
        let value = null
        if (type === "s") value = shared[Number(v)] ?? null
        else if (type === "inlineStr") value = textOf(inner)
        else if (type === "str" || type === "e") value = v != null ? unescapeXml(v) : null
        else if (type === "b") value = v === "1"
        else if (v != null) value = Number(v)
        row[cIdx] = value
      }
      rows[rIdx] = row
    }
    result[name] = Array.from(rows, (r) => (r ? Array.from(r, (c) => c ?? null) : []))
  }
  return result
}

// Excel stores dates as days since 1899-12-30.
export function excelSerialToISO(serial) {
  const ms = Math.round((serial - 25569) * 86400000)
  return new Date(ms).toISOString().slice(0, 10)
}
