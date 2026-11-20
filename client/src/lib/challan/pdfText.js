// PDF → positioned text items, in the browser. pdf.js is loaded on demand so
// it only costs anything when someone actually uploads a challan.

export async function readPdfItems(file) {
  const [pdfjs, { default: workerUrl }] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  let doc
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  } catch {
    throw new Error("Couldn't open this PDF. Is it a valid, non-password-protected file?")
  }

  const items = []
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent()
    for (const it of content.items) {
      if (!it.str) continue
      items.push({ page: p, x: it.transform[4], y: it.transform[5], w: it.width, str: it.str })
    }
  }
  if (!items.some((i) => i.str.trim())) {
    throw new Error("This PDF has no readable text (it may be a scan). Fill the consignment in by hand.")
  }
  return items
}
