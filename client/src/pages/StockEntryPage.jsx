import { useEffect, useMemo, useState } from "react"
import {
  bulkAddInventory,
  bulkRemoveInventory,
  createInventoryEntry,
  fetchDestinations,
  fetchManufacturers,
  fetchProducts,
} from "../api/inventoryApi"
import { SHIPMENT_PRODUCTS, buildLineDeductions, buildAllDeductions } from "../lib/shipmentConfig"

// ── Product catalogue (for ADD / RECOUNT item filtering) ──────────────────
// Potli is now a standalone product — removed from Ele and Kiko items
const PRODUCT_CATALOGUE = [
  {
    key: "ele",
    label: "Ele Ring Silicone Teether Set",
    image: "https://res.cloudinary.com/dgqcdiyad/image/upload/f_auto,q_auto/ele-teether-blue-beige__wljswi",
    items: [
      "Ele Sage Green Teether", "Ele Aqua Blue Teether", "Ele Slate Grey Teether",
      "Ele Oat Beige Teether", "Ele Baby Pink Teether",
      "Ele Box",
    ],
  },
  {
    key: "kiko",
    label: "Kiko No Drop Teether",
    image: "https://res.cloudinary.com/dgqcdiyad/image/upload/f_auto,q_auto/kiko_teether_baby_hand_green_b23ujn",
    items: [
      "Kiko Teether Green", "Kiko Teether White", "Kiko Teether Blue",
      "Kiko Box",
    ],
  },
  {
    key: "cloth",
    label: "HIGH CONTRAST BOOKSET",
    image: "https://res.cloudinary.com/dgqcdiyad/image/upload/f_auto,q_auto/cloth_book_uu9rnk",
    items: [
      "My First Patterns Book", "My First Faces Book", "My First Puzzles Book",
      "Book Kit Sleeve", "Book Kit Thank You Card",
    ],
  },
  { key: "cloth-book-item",  label: "My First Book",                          image: "https://res.cloudinary.com/dgqcdiyad/image/upload/q_auto/f_auto/v1779791651/Screenshot_2026-05-26_160139_mnb1vn.png",  items: ["My First Book"] },
  { key: "flashcards-item",  label: "Flashcards",                          image: "https://res.cloudinary.com/dgqcdiyad/image/upload/q_auto/f_auto/v1779791741/Screenshot_2026-05-26_160204_oybf6b.png",  items: ["Flashcards"] },
  { key: "banner-item",      label: "Banner",                              image: "https://res.cloudinary.com/dgqcdiyad/image/upload/q_auto/f_auto/v1779791776/Screenshot_2026-05-26_160213_mhblmx.png",  items: ["Banner"] },
  { key: "ribbon-item",      label: "Ribbon",                              image: "https://res.cloudinary.com/dgqcdiyad/image/upload/q_auto/f_auto/v1779791854/Screenshot_2026-05-26_160245_lwbfg3.png",  items: ["Ribbon"] },
  { key: "gift-kit-sleeve",  label: "Sensory Kit Sleeve",                     image: null, items: ["Sensory Kit Sleeve"] },
  { key: "gift-kit-tyc",     label: "Sensory Kit Thank You Card",             image: "https://res.cloudinary.com/dgqcdiyad/image/upload/q_auto/f_auto/v1780056711/sensory_kit_ty_card_ywfjts.jpg",  items: ["Sensory Kit Thank You Card"] },
  { key: "fb-box",           label: "Flashcard Kit Box",    image: "https://res.cloudinary.com/dgqcdiyad/image/upload/q_auto/f_auto/v1779791902/Screenshot_2026-05-26_160307_tebij6.png",  items: ["Flashcard Kit Box"] },
  { key: "fb-tyc",           label: "Flashcard Kit Thank You Card",   image: null, items: ["Flashcard Kit Thank You Card"] },
  {
    key: "potli",
    label: "Potli",
    image: null,
    items: ["Potli"],
  },
  {
    key: "teether-tyc",
    label: "Teether Thank You Card",
    image: "https://res.cloudinary.com/dgqcdiyad/image/upload/q_auto/f_auto/v1780056911/teether_ty_ca_yusojr.jpg",
    items: ["Teether Thank You Card"],
  },
]

// ── Corrugation box (ADD only) ─────────────────────────────────────────────
const CORRUGATION_BOX = {
  key: "corrugation",
  label: "Corrugation Box (Transport Box)",
  image: "https://res.cloudinary.com/dgqcdiyad/image/upload/f_auto,q_auto/corrugation_box_ph3v1n",
}

// ── Blue Box (ADD only) ────────────────────────────────────────────────────
const BLUE_BOX_CARD = {
  key: "bluebox",
  label: "Blue Box",
  image: "https://res.cloudinary.com/dgqcdiyad/image/upload/v1778126339/Screenshot_2026-05-07_092800_pes65w.png",
}


// ── Corrugation flow component ─────────────────────────────────────────────
function CorrugationFlow({ manufacturers }) {
  const today = new Date().toISOString().split("T")[0]
  const [boxes, setBoxes] = useState("")
  const [source, setSource] = useState("")
  const [remarks, setRemarks] = useState("")
  const [entryDate, setEntryDate] = useState(today)
  const [images, setImages] = useState([])
  const [imagePreviews, setImagePreviews] = useState([])
  const [fileInputKey, setFileInputKey] = useState(0)
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const onFileChange = (e) => {
    const incoming = Array.from(e.target.files || [])
    const combined = [...images, ...incoming].slice(0, 3)
    imagePreviews.forEach((u) => URL.revokeObjectURL(u))
    setImages(combined)
    setImagePreviews(combined.map((f) => URL.createObjectURL(f)))
    setFileInputKey((k) => k + 1)
  }

  const removeImg = (i) => {
    URL.revokeObjectURL(imagePreviews[i])
    setImages((p) => p.filter((_, idx) => idx !== i))
    setImagePreviews((p) => p.filter((_, idx) => idx !== i))
    setFileInputKey((k) => k + 1)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!boxes || Number(boxes) <= 0) { setMessage("Please enter a valid number of boxes."); return }
    if (!source) { setMessage("Please select a source."); return }

    setSubmitting(true)
    setMessage("")
    try {
      await bulkAddInventory({
        additions: [{ name: "Corrugation Box", quantity: Number(boxes) }],
        source, remarks, images, entry_date: entryDate,
      })
      setMessage("✓ Corrugation boxes added successfully.")
      setBoxes(""); setSource(""); setRemarks(""); setEntryDate(today)
      imagePreviews.forEach((u) => URL.revokeObjectURL(u))
      setImages([]); setImagePreviews([]); setFileInputKey((k) => k + 1)
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to add. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <p className="text-sm font-semibold text-slate-700">Step 2 — Details</p>
      <label className="grid gap-2 text-sm font-medium text-slate-700">
        Number of corrugated boxes received *
        <input type="number" min="1" value={boxes} onChange={(e) => setBoxes(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2" placeholder="e.g. 10" />
      </label>
      {boxes && Number(boxes) > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <span className="font-semibold text-emerald-800">This will add: </span>
          <span className="text-emerald-700">{Number(boxes)} Corrugation Box{Number(boxes) !== 1 ? "es" : ""}</span>
        </div>
      )}
      <label className="grid gap-2 text-sm font-medium text-slate-700">
        From (Source) *
        <select value={source} onChange={(e) => setSource(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2">
          <option value="">Select source</option>
          {manufacturers.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
        </select>
      </label>
      <label className="grid gap-2 text-sm font-medium text-slate-700">
        Remarks
        <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)}
          rows="2" className="rounded-lg border border-slate-300 px-3 py-2" />
      </label>
      <label className="grid gap-2 text-sm font-medium text-slate-700">
        Date *
        <input type="date" value={entryDate} max={today} onChange={(e) => setEntryDate(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2" />
      </label>
      <div className="grid gap-2">
        <p className="text-sm font-medium text-slate-700">
          Images <span className="font-normal text-slate-400">(Optional, max 3)</span>
          {images.length > 0 && <span className="font-normal text-slate-400"> — {images.length} selected</span>}
        </p>
        {images.length < 3 && (
          <input key={fileInputKey} type="file" accept="image/*" multiple onChange={onFileChange}
            className="rounded-lg border border-slate-300 p-2 text-sm" />
        )}
        {imagePreviews.length > 0 && (
          <div className="mt-1 grid grid-cols-3 gap-2">
            {imagePreviews.map((preview, idx) => (
              <div key={idx} className="relative group">
                <img src={preview} alt="" className="h-20 w-full rounded-lg object-cover border border-slate-200" />
                <button type="button" onClick={() => removeImg(idx)}
                  className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-lg opacity-100 md:opacity-0 md:group-hover:opacity-100 transition">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <span className="absolute bottom-1 left-1 rounded bg-black/40 px-1 text-[10px] text-white">{idx + 1}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {message && (
        <p className={`text-sm font-medium ${message.startsWith("✓") ? "text-emerald-600" : "text-rose-600"}`}>{message}</p>
      )}
      <button type="submit" disabled={submitting || !boxes || Number(boxes) <= 0 || !source}
        className="w-full rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed sm:w-fit transition-colors">
        {submitting ? "Adding..." : "Confirm Add"}
      </button>
    </form>
  )
}

// ── Blue Box flow component ────────────────────────────────────────────────
function BlueBoxFlow({ manufacturers }) {
  const today = new Date().toISOString().split("T")[0]
  const [qty, setQty] = useState("")
  const [source, setSource] = useState("")
  const [remarks, setRemarks] = useState("")
  const [entryDate, setEntryDate] = useState(today)
  const [images, setImages] = useState([])
  const [imagePreviews, setImagePreviews] = useState([])
  const [fileInputKey, setFileInputKey] = useState(0)
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const onFileChange = (e) => {
    const incoming = Array.from(e.target.files || [])
    const combined = [...images, ...incoming].slice(0, 3)
    imagePreviews.forEach((u) => URL.revokeObjectURL(u))
    setImages(combined)
    setImagePreviews(combined.map((f) => URL.createObjectURL(f)))
    setFileInputKey((k) => k + 1)
  }

  const removeImg = (i) => {
    URL.revokeObjectURL(imagePreviews[i])
    setImages((p) => p.filter((_, idx) => idx !== i))
    setImagePreviews((p) => p.filter((_, idx) => idx !== i))
    setFileInputKey((k) => k + 1)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!qty || Number(qty) <= 0) { setMessage("Please enter a valid quantity."); return }
    if (!source) { setMessage("Please select a source."); return }
    setSubmitting(true)
    setMessage("")
    try {
      await bulkAddInventory({
        additions: [{ name: "Blue Box", quantity: Number(qty) }],
        source, remarks, images, entry_date: entryDate,
      })
      setMessage("✓ Blue Boxes added successfully.")
      setQty(""); setSource(""); setRemarks(""); setEntryDate(today)
      imagePreviews.forEach((u) => URL.revokeObjectURL(u))
      setImages([]); setImagePreviews([]); setFileInputKey((k) => k + 1)
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to add. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <p className="text-sm font-semibold text-slate-700">Step 2 — Details</p>
      <label className="grid gap-2 text-sm font-medium text-slate-700">
        Number of Blue Boxes received *
        <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2" placeholder="e.g. 50" />
      </label>
      {qty && Number(qty) > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <span className="font-semibold text-emerald-800">This will add: </span>
          <span className="text-emerald-700">{Number(qty)} Blue Box{Number(qty) !== 1 ? "es" : ""}</span>
        </div>
      )}
      <label className="grid gap-2 text-sm font-medium text-slate-700">
        From (Source) *
        <select value={source} onChange={(e) => setSource(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2">
          <option value="">Select source</option>
          {manufacturers.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
        </select>
      </label>
      <label className="grid gap-2 text-sm font-medium text-slate-700">
        Remarks
        <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)}
          rows="2" className="rounded-lg border border-slate-300 px-3 py-2" />
      </label>
      <label className="grid gap-2 text-sm font-medium text-slate-700">
        Date *
        <input type="date" value={entryDate} max={today} onChange={(e) => setEntryDate(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2" />
      </label>
      <div className="grid gap-2">
        <p className="text-sm font-medium text-slate-700">
          Images <span className="font-normal text-slate-400">(Optional, max 3)</span>
          {images.length > 0 && <span className="font-normal text-slate-400"> — {images.length} selected</span>}
        </p>
        {images.length < 3 && (
          <input key={fileInputKey} type="file" accept="image/*" multiple onChange={onFileChange}
            className="rounded-lg border border-slate-300 p-2 text-sm" />
        )}
        {imagePreviews.length > 0 && (
          <div className="mt-1 grid grid-cols-3 gap-2">
            {imagePreviews.map((preview, idx) => (
              <div key={idx} className="relative group">
                <img src={preview} alt="" className="h-20 w-full rounded-lg object-cover border border-slate-200" />
                <button type="button" onClick={() => removeImg(idx)}
                  className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-lg opacity-100 md:opacity-0 md:group-hover:opacity-100 transition">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <span className="absolute bottom-1 left-1 rounded bg-black/40 px-1 text-[10px] text-white">{idx + 1}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {message && (
        <p className={`text-sm font-medium ${message.startsWith("✓") ? "text-emerald-600" : "text-rose-600"}`}>{message}</p>
      )}
      <button type="submit" disabled={submitting || !qty || Number(qty) <= 0 || !source}
        className="w-full rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed sm:w-fit transition-colors">
        {submitting ? "Adding..." : "Confirm Add"}
      </button>
    </form>
  )
}

// ── Shared product card (Add / Recount flow) ───────────────────────────────
function ProductCard({ item, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.key)}
      className={`flex flex-col items-center gap-2 rounded-xl border-2 p-3 text-center transition-all focus:outline-none
        ${selected
          ? "border-indigo-500 bg-indigo-50 shadow-md"
          : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50"
        }`}
    >
      <div className="relative h-36 w-full overflow-hidden rounded-lg bg-slate-100">
        {item.image ? (
          <img src={item.image} alt={item.label} className="h-full w-full object-cover"
            onError={(e) => { e.target.style.display = "none" }} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300">
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          </div>
        )}
        {selected && (
          <div className="absolute inset-0 flex items-center justify-center bg-indigo-500/20">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500 text-white text-xs font-bold">✓</span>
          </div>
        )}
      </div>
      <p className="text-xs font-bold leading-tight">
        <span className="bg-yellow-100 rounded px-1 py-0.5">{item.label}</span>
      </p>
    </button>
  )
}

// ── Shipment product card (multi-select with badge + active state) ─────────
function ShipmentProductCard({ item, isActive, lineCount, onClick }) {
  const hasLines = lineCount > 0
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-3 text-center transition-all focus:outline-none
        ${isActive
          ? "border-indigo-500 bg-indigo-50 shadow-md ring-2 ring-indigo-100"
          : hasLines
          ? "border-emerald-400 bg-emerald-50 shadow-sm"
          : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50"
        }`}
    >
      {hasLines && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-500 px-1 text-white text-[10px] font-bold z-10">
          {lineCount}
        </span>
      )}
      <div className="relative h-28 w-full overflow-hidden rounded-lg bg-slate-100">
        {item.image ? (
          <img src={item.image} alt={item.label} className="h-full w-full object-cover"
            onError={(e) => { e.target.style.display = "none" }} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300">
            <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          </div>
        )}
        {isActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-indigo-500/20">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500 text-white text-xs font-bold">✓</span>
          </div>
        )}
      </div>
      <p className={`text-xs font-bold leading-tight`}>
        <span className="bg-yellow-100 rounded px-1 py-0.5">
          {item.label}
        </span>
      </p>
      {item.masterId && (
        <p className="text-[10px] font-mono text-slate-400">{item.masterId}</p>
      )}
    </button>
  )
}

// ── Shipment flow — multi-product packing interface ───────────────────────
function ShipmentFlow({ destinations }) {
  const today = new Date().toISOString().split("T")[0]

  // Shipment lines: [{id, productKey, variantKey, qty}]
  const [lines, setLines] = useState([])

  // Active product panel
  const [activeProductKey, setActiveProductKey] = useState(null)
  const [pendingVariant, setPendingVariant] = useState("")
  const [pendingQty, setPendingQty] = useState("")

  // Shared shipment fields
  const [destination, setDestination] = useState("")
  const [remarks, setRemarks] = useState("")
  const [entryDate, setEntryDate] = useState(today)
  const [corrugationBoxesUsed, setCorrugationBoxesUsed] = useState("")
  const [images, setImages] = useState([])
  const [imagePreviews, setImagePreviews] = useState([])
  const [fileInputKey, setFileInputKey] = useState(0)
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const activeProduct = SHIPMENT_PRODUCTS.find((p) => p.key === activeProductKey)

  const allDeductions = useMemo(() => buildAllDeductions(lines), [lines])

  const linesPerProduct = useMemo(() => {
    const counts = {}
    lines.forEach((l) => { counts[l.productKey] = (counts[l.productKey] || 0) + 1 })
    return counts
  }, [lines])

  const totalQty = lines.reduce((sum, l) => sum + l.qty, 0)

  // Full deduction list including corrugation (shown in preview + sent to backend)
  const fullDeductions = useMemo(() => {
    const corrugQty = Number(corrugationBoxesUsed)
    if (corrugQty > 0) {
      return [...allDeductions, { name: "Corrugation Box", quantity: corrugQty }]
    }
    return allDeductions
  }, [allDeductions, corrugationBoxesUsed])

  const handleCardClick = (productKey) => {
    if (activeProductKey === productKey) {
      setActiveProductKey(null)
    } else {
      setActiveProductKey(productKey)
      setPendingVariant("")
      setPendingQty("")
    }
    setMessage("")
  }

  const addLine = () => {
    if (!activeProductKey) return
    if (activeProduct?.variants && !pendingVariant) {
      setMessage("Please select a variant first.")
      return
    }
    const qty = Number(pendingQty)
    if (!pendingQty || qty <= 0) {
      setMessage("Please enter a valid quantity.")
      return
    }

    // Merge if same product + variant already exists
    const existingIdx = lines.findIndex(
      (l) => l.productKey === activeProductKey && l.variantKey === pendingVariant
    )
    if (existingIdx >= 0) {
      setLines((prev) =>
        prev.map((l, i) => (i === existingIdx ? { ...l, qty: l.qty + qty } : l))
      )
    } else {
      setLines((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          productKey: activeProductKey,
          variantKey: pendingVariant,
          qty,
        },
      ])
    }

    setPendingVariant("")
    setPendingQty("")
    setMessage("")
  }

  const removeLine = (id) => {
    setLines((prev) => prev.filter((l) => l.id !== id))
  }

  const updateLineQty = (id, val) => {
    const qty = Number(val)
    if (!val || qty <= 0) return
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, qty } : l)))
  }

  const onFileChange = (e) => {
    const incoming = Array.from(e.target.files || [])
    const combined = [...images, ...incoming].slice(0, 3)
    imagePreviews.forEach((u) => URL.revokeObjectURL(u))
    setImages(combined)
    setImagePreviews(combined.map((f) => URL.createObjectURL(f)))
    setFileInputKey((k) => k + 1)
  }

  const removeImg = (i) => {
    URL.revokeObjectURL(imagePreviews[i])
    setImages((p) => p.filter((_, idx) => idx !== i))
    setImagePreviews((p) => p.filter((_, idx) => idx !== i))
    setFileInputKey((k) => k + 1)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (lines.length === 0) { setMessage("Please add at least one product to the shipment."); return }
    if (!destination) { setMessage("Please select a destination."); return }
    if (!corrugationBoxesUsed || Number(corrugationBoxesUsed) <= 0) {
      setMessage("Please enter the number of corrugation boxes used.")
      return
    }

    setSubmitting(true)
    setMessage("")
    try {
      await bulkRemoveInventory({
        deductions: fullDeductions,
        destination,
        remarks: remarks || undefined,
        images,
        entry_date: entryDate,
      })
      setMessage("✓ Shipment recorded successfully.")
      setLines([])
      setActiveProductKey(null)
      setPendingVariant("")
      setPendingQty("")
      setDestination("")
      setRemarks("")
      setCorrugationBoxesUsed("")
      setEntryDate(today)
      imagePreviews.forEach((u) => URL.revokeObjectURL(u))
      setImages([])
      setImagePreviews([])
      setFileInputKey((k) => k + 1)
    } catch (err) {
      console.error("[Shipment error]", err?.response?.status, err?.response?.data)
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to record shipment. Please try again."
      setMessage(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6">

      {/* Step 1 — Product cards */}
      <div className="grid gap-3">
        <p className="text-sm font-semibold text-slate-700">
          Step 1 — Select products to ship{" "}
          <span className="font-normal text-slate-400 text-xs">click a card to configure, click again to close</span>
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {SHIPMENT_PRODUCTS.map((p) => (
            <ShipmentProductCard
              key={p.key}
              item={p}
              isActive={activeProductKey === p.key}
              lineCount={linesPerProduct[p.key] || 0}
              onClick={() => handleCardClick(p.key)}
            />
          ))}
        </div>
      </div>

      {/* Step 2 — Configuration panel for active product */}
      {activeProduct && (
        <>
          <div className="h-px bg-slate-100" />
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 grid gap-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-indigo-800">
                Configure: {activeProduct.label}
              </p>
              <button type="button" onClick={() => setActiveProductKey(null)}
                className="text-xs text-indigo-400 hover:text-indigo-700 transition-colors">
                Close ✕
              </button>
            </div>

            {/* Variant selection — rendered dynamically from product config */}
            {activeProduct.variants && (
              <div className="grid gap-2">
                <p className="text-xs font-medium text-slate-600">Select variant *</p>
                <div className="flex flex-wrap gap-2">
                  {activeProduct.variants.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => setPendingVariant(v.key)}
                      className={`flex flex-col items-start rounded-lg border-2 px-3 py-1.5 text-xs font-medium transition-all ${
                        pendingVariant === v.key
                          ? "border-indigo-500 bg-indigo-100 text-indigo-700"
                          : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300"
                      }`}
                    >
                      <span>{v.label}</span>
                      {v.masterId && (
                        <span className={`font-mono font-normal ${pendingVariant === v.key ? "text-indigo-400" : "text-slate-400"}`}>
                          {v.masterId}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity + Add */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                Quantity *
                <input
                  type="number"
                  min="1"
                  value={pendingQty}
                  onChange={(e) => setPendingQty(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLine() } }}
                  className="w-full sm:w-36 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  placeholder="e.g. 5"
                />
              </label>
              <button
                type="button"
                onClick={addLine}
                disabled={!pendingQty || Number(pendingQty) <= 0 || (!!activeProduct.variants && !pendingVariant)}
                className="shrink-0 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                + Add to Shipment
              </button>
            </div>

            {message && !message.startsWith("✓") && (
              <p className="text-xs font-medium text-rose-600">{message}</p>
            )}
          </div>
        </>
      )}

      {/* Shipment lines table */}
      {lines.length > 0 && (
        <>
          <div className="h-px bg-slate-100" />
          <div className="grid gap-3">
            <p className="text-sm font-semibold text-slate-700">Items in this shipment</p>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Product</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Variant</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 w-28">Qty</th>
                    <th className="px-3 py-2.5 w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {lines.map((line) => {
                    const product = SHIPMENT_PRODUCTS.find((p) => p.key === line.productKey)
                    const variant = product?.variants?.find((v) => v.key === line.variantKey)
                    return (
                      <tr key={line.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium text-slate-800">
                          {product?.label || line.productKey}
                        </td>
                        <td className="px-3 py-2 text-slate-600 text-sm">
                          {variant?.label || <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="1"
                            value={line.qty}
                            onChange={(e) => updateLineQty(line.id, e.target.value)}
                            className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm text-center"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button type="button" onClick={() => removeLine(line.id)}
                            className="text-xs font-medium text-rose-500 hover:text-rose-700 transition-colors">
                            Remove
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Deductions preview — grouped by shipment line */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="mb-3 text-sm font-semibold text-amber-800">This will deduct from inventory:</p>
            <div className="space-y-2">
              {lines.map((line) => {
                const product = SHIPMENT_PRODUCTS.find((p) => p.key === line.productKey)
                const variant = product?.variants?.find((v) => v.key === line.variantKey)
                const lineDeductions = buildLineDeductions(line.productKey, line.variantKey, line.qty)
                return (
                  <div key={line.id} className="overflow-hidden rounded-lg border border-amber-200">
                    <div className="bg-amber-100 px-3 py-2">
                      <p className="text-xs font-semibold text-amber-900">
                        {product?.label}
                        {variant ? ` — ${variant.label}` : ""}
                        <span className="ml-1.5 font-normal text-amber-700">×{line.qty}</span>
                      </p>
                    </div>
                    <div className="divide-y divide-amber-100">
                      {lineDeductions.map((d, i) => (
                        <div key={i} className="flex items-center justify-between bg-white px-3 py-2 text-sm even:bg-amber-50">
                          <span className="text-slate-700">{d.name}</span>
                          <span className="font-semibold text-rose-600">− {d.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
              {Number(corrugationBoxesUsed) > 0 && (
                <div className="overflow-hidden rounded-lg border border-amber-200">
                  <div className="bg-amber-100 px-3 py-2">
                    <p className="text-xs font-semibold text-amber-900">Transport</p>
                  </div>
                  <div className="flex items-center justify-between bg-white px-3 py-2 text-sm">
                    <span className="text-slate-700">Corrugation Box</span>
                    <span className="font-semibold text-rose-600">− {Number(corrugationBoxesUsed)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Shipment details */}
          <div className="h-px bg-slate-100" />
          <div className="grid gap-4">
            <p className="text-sm font-semibold text-slate-700">Shipment Details</p>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Destination *
              <select value={destination} onChange={(e) => setDestination(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2">
                <option value="">Select destination</option>
                {destinations.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </label>

            <div className="grid gap-1">
              <label className="text-sm font-medium text-slate-700">
                Corrugation boxes used *
              </label>
              <input
                type="number"
                min="1"
                value={corrugationBoxesUsed}
                onChange={(e) => setCorrugationBoxesUsed(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm max-w-[200px]"
                placeholder="e.g. 15"
              />
              <p className="text-xs text-slate-500">This quantity will be deducted from Corrugation Box inventory</p>
            </div>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Remarks
              <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)}
                rows="2" className="rounded-lg border border-slate-300 px-3 py-2" />
            </label>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Date *
              <input type="date" value={entryDate} max={today}
                onChange={(e) => setEntryDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2" />
            </label>

            {/* Images */}
            <div className="grid gap-2">
              <p className="text-sm font-medium text-slate-700">
                Images <span className="font-normal text-slate-400">(Optional, max 3)</span>
                {images.length > 0 && <span className="font-normal text-slate-400"> — {images.length} selected</span>}
              </p>
              {images.length < 3 && (
                <input key={fileInputKey} type="file" accept="image/*" multiple onChange={onFileChange}
                  className="rounded-lg border border-slate-300 p-2 text-sm" />
              )}
              {imagePreviews.length > 0 && (
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {imagePreviews.map((preview, idx) => (
                    <div key={idx} className="relative group">
                      <img src={preview} alt="" className="h-20 w-full rounded-lg object-cover border border-slate-200" />
                      <button type="button" onClick={() => removeImg(idx)}
                        className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-lg opacity-100 md:opacity-0 md:group-hover:opacity-100 transition">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                      <span className="absolute bottom-1 left-1 rounded bg-black/40 px-1 text-[10px] text-white">{idx + 1}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Shipment summary panel */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="mb-3 text-sm font-semibold text-emerald-800">Shipment Summary</p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-emerald-700">Product</th>
                    <th className="pb-2 pl-4 text-left text-xs font-semibold uppercase tracking-wide text-emerald-700">Variant</th>
                    <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-emerald-700">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const product = SHIPMENT_PRODUCTS.find((p) => p.key === line.productKey)
                    const variant = product?.variants?.find((v) => v.key === line.variantKey)
                    return (
                      <tr key={line.id} className="border-t border-emerald-100">
                        <td className="py-1.5 pr-4 text-slate-700">{product?.label}</td>
                        <td className="py-1.5 pl-4 pr-4 text-slate-600 text-xs">{variant?.label || "—"}</td>
                        <td className="py-1.5 text-right font-semibold text-slate-800">{line.qty}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-emerald-200">
                    <td className="pt-2 font-semibold text-emerald-800" colSpan="2">
                      {lines.length} line{lines.length !== 1 ? "s" : ""} · Total units
                    </td>
                    <td className="pt-2 text-right font-bold text-emerald-900 text-base">{totalQty}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {message && (
        <p className={`text-sm font-medium ${message.startsWith("✓") ? "text-emerald-600" : "text-rose-600"}`}>
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || lines.length === 0 || !destination || !corrugationBoxesUsed || Number(corrugationBoxesUsed) <= 0}
        className="w-full rounded-lg bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed sm:w-fit transition-colors"
      >
        {submitting ? "Recording shipment..." : `Confirm Shipment${totalQty > 0 ? ` (${totalQty} units)` : ""}`}
      </button>
    </form>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
function StockEntryPage() {
  const [products, setProducts] = useState([])
  const [manufacturers, setManufacturers] = useState([])
  const [destinations, setDestinations] = useState([])
  const [message, setMessage] = useState("")
  const [selectedCatalogueKey, setSelectedCatalogueKey] = useState(null)
  const today = new Date().toISOString().split("T")[0]
  const [form, setForm] = useState({
    product_id: "",
    type: "add",
    quantity: "",
    source: "",
    destination: "",
    remarks: "",
    images: [],
    entry_date: today,
  })
  const [imagePreviews, setImagePreviews] = useState([])
  const [fileInputKey, setFileInputKey] = useState(0)

  useEffect(() => {
    Promise.all([fetchProducts(), fetchManufacturers(), fetchDestinations()]).then(([p, m, d]) => {
      setProducts(p)
      setManufacturers(m)
      setDestinations(d)
    })
  }, [])

  const filteredProducts = useMemo(() => {
    if (!selectedCatalogueKey) return []
    const cat = PRODUCT_CATALOGUE.find((c) => c.key === selectedCatalogueKey)
    if (!cat) return []
    return products.filter((p) =>
      cat.items.some((item) => item.toLowerCase() === p.name.toLowerCase())
    )
  }, [selectedCatalogueKey, products])

  const handleCatalogueSelect = (key) => {
    setSelectedCatalogueKey(key)
    setForm((prev) => ({ ...prev, product_id: "" }))
    setMessage("")
  }

  const isCorrugation = form.type === "add" && selectedCatalogueKey === "corrugation"
  const isBlueBox = form.type === "add" && selectedCatalogueKey === "bluebox"
  const isSpecialCard = isCorrugation || isBlueBox

  const typeFields = useMemo(() => {
    if (form.type === "add") return "source"
    if (form.type === "shipment") return "destination"
    return "adjustment"
  }, [form.type])

  const onChange = (event) => {
    const { name, value } = event.target
    if (name === "type") setSelectedCatalogueKey(null)
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const onFileChange = (event) => {
    const incoming = Array.from(event.target.files || [])
    const combined = [...form.images, ...incoming].slice(0, 3)
    imagePreviews.forEach((url) => URL.revokeObjectURL(url))
    const previews = combined.map((file) => URL.createObjectURL(file))
    setForm((prev) => ({ ...prev, images: combined }))
    setImagePreviews(previews)
    setFileInputKey((k) => k + 1)
  }

  const removeImage = (index) => {
    URL.revokeObjectURL(imagePreviews[index])
    setForm((prev) => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }))
    setImagePreviews((prev) => prev.filter((_, i) => i !== index))
    setFileInputKey((k) => k + 1)
  }

  const validate = () => {
    if (!selectedCatalogueKey) return "Please select a product."
    if (!form.product_id || !form.quantity) return "Please fill all required fields."
    if (Number(form.quantity) <= 0) return "Quantity must be greater than 0."
    if (form.type === "add" && !form.source) return "Please select where stock came from."
    return ""
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    const error = validate()
    if (error) { setMessage(error); return }

    const payload = new FormData()
    payload.append("product_id", form.product_id)
    payload.append("type", form.type)
    payload.append("quantity", form.quantity)
    payload.append("remarks", form.remarks)
    payload.append("entry_date", form.entry_date || today)
    if (form.type === "add") payload.append("source", form.source)
    form.images.forEach((image) => payload.append("images", image))

    await createInventoryEntry(payload)
    setMessage("Stock entry saved successfully.")
    imagePreviews.forEach((url) => URL.revokeObjectURL(url))
    setImagePreviews([])
    setFileInputKey((k) => k + 1)
    setSelectedCatalogueKey(null)
    setForm({ product_id: "", type: "add", quantity: "", source: "", destination: "", remarks: "", images: [], entry_date: today })
  }

  const selectedCatalogue = PRODUCT_CATALOGUE.find((c) => c.key === selectedCatalogueKey)

  const actionTabs = [
    { value: "add",        label: "Add",      color: "emerald" },
    { value: "shipment",   label: "Shipment", color: "rose"    },
    { value: "adjustment", label: "Recount",  color: "amber"   },
  ]

  const tabColors = {
    emerald: { active: "bg-emerald-600 text-white border-emerald-600", inactive: "border-slate-300 text-slate-600 hover:border-emerald-400" },
    rose:    { active: "bg-rose-600 text-white border-rose-600",       inactive: "border-slate-300 text-slate-600 hover:border-rose-400"    },
    amber:   { active: "bg-amber-500 text-white border-amber-500",     inactive: "border-slate-300 text-slate-600 hover:border-amber-400"   },
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">Stock Entry</h2>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 space-y-6">

        {/* Action tabs */}
        <div className="grid gap-3">
          <p className="text-sm font-semibold text-slate-700">Action *</p>
          <div className="flex gap-2">
            {actionTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => {
                  setSelectedCatalogueKey(null)
                  setForm((prev) => ({ ...prev, type: tab.value, product_id: "" }))
                  setMessage("")
                }}
                className={`rounded-lg border-2 px-5 py-2 text-sm font-semibold transition-all ${
                  form.type === tab.value
                    ? tabColors[tab.color].active
                    : tabColors[tab.color].inactive
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-px bg-slate-100" />

        {/* SHIPMENT flow */}
        {form.type === "shipment" && (
          <ShipmentFlow destinations={destinations} />
        )}

        {/* ADD / RECOUNT flow */}
        {form.type !== "shipment" && (
          <div className="grid gap-6">

            {/* Product cards */}
            <div className="grid gap-3">
              <p className="text-sm font-semibold text-slate-700">Step 1 — Select a product *</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {PRODUCT_CATALOGUE.map((cat) => (
                  <ProductCard
                    key={cat.key}
                    item={cat}
                    selected={selectedCatalogueKey === cat.key}
                    onSelect={handleCatalogueSelect}
                  />
                ))}
                {/* Corrugation box — ADD only */}
                {form.type === "add" && (
                  <ProductCard
                    item={CORRUGATION_BOX}
                    selected={selectedCatalogueKey === "corrugation"}
                    onSelect={handleCatalogueSelect}
                  />
                )}
                {/* Blue Box — ADD only */}
                {form.type === "add" && (
                  <ProductCard
                    item={BLUE_BOX_CARD}
                    selected={selectedCatalogueKey === "bluebox"}
                    onSelect={handleCatalogueSelect}
                  />
                )}
              </div>
            </div>

            {/* Corrugation special flow — own self-contained form, no nesting */}
            {isCorrugation && (
              <>
                <div className="h-px bg-slate-100" />
                <CorrugationFlow manufacturers={manufacturers} />
              </>
            )}

            {/* Blue Box special flow — own self-contained form, no nesting */}
            {isBlueBox && (
              <>
                <div className="h-px bg-slate-100" />
                <BlueBoxFlow manufacturers={manufacturers} />
              </>
            )}

            {/* Regular item form — only rendered when not a special card */}
            {!isSpecialCard && (
              <form onSubmit={onSubmit} className="grid gap-6">
            {selectedCatalogueKey && (
              <>
                <div className="h-px bg-slate-100" />
                <div className="grid gap-4">
                  <p className="text-sm font-semibold text-slate-700">
                    Step 2 — Fill in the details
                    <span className="ml-2 text-xs font-normal text-indigo-600 bg-indigo-50 rounded-full px-2 py-0.5">
                      {selectedCatalogue?.label}
                    </span>
                  </p>

                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Item *
                    <select name="product_id" value={form.product_id} onChange={onChange}
                      className="rounded-lg border border-slate-300 px-3 py-2">
                      <option value="">Select item</option>
                      {filteredProducts.map((product) => (
                        <option key={product.id} value={product.id}>{product.name}</option>
                      ))}
                    </select>
                    {filteredProducts.length === 0 && (
                      <p className="text-xs text-amber-600">No matching items found for this product.</p>
                    )}
                  </label>

                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    {(() => {
                      const selectedItem = filteredProducts.find((p) => String(p.id) === String(form.product_id))
                      return selectedItem?.name?.toLowerCase() === "ribbon"
                        ? "Quantity (in meters) *"
                        : "Quantity *"
                    })()}
                    <input
                      name="quantity"
                      type="number"
                      min="1"
                      value={form.quantity}
                      onChange={onChange}
                      className="rounded-lg border border-slate-300 px-3 py-2"
                      placeholder={
                        filteredProducts.find((p) => String(p.id) === String(form.product_id))?.name?.toLowerCase() === "ribbon"
                          ? "e.g. 100 meters"
                          : ""
                      }
                    />
                  </label>

                  {typeFields === "source" && (
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      From *
                      <select name="source" value={form.source} onChange={onChange}
                        className="rounded-lg border border-slate-300 px-3 py-2">
                        <option value="">Select source</option>
                        {manufacturers.map((item) => (
                          <option key={item.id} value={item.name}>{item.name}</option>
                        ))}
                      </select>
                    </label>
                  )}

                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Remarks
                    <textarea name="remarks" value={form.remarks} onChange={onChange} rows="3"
                      className="rounded-lg border border-slate-300 px-3 py-2" />
                  </label>

                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Date *
                    <input name="entry_date" type="date" value={form.entry_date} max={today}
                      onChange={onChange} className="rounded-lg border border-slate-300 px-3 py-2" />
                  </label>

                  {/* Images */}
                  <div className="grid gap-2">
                    <p className="text-sm font-medium text-slate-700">
                      Images <span className="font-normal text-slate-400">(Optional, max 3)</span>
                      {form.images.length > 0 && (
                        <span className="font-normal text-slate-400"> — {form.images.length} selected</span>
                      )}
                    </p>
                    {form.images.length < 3 && (
                      <input key={fileInputKey} type="file" accept="image/*" multiple onChange={onFileChange}
                        className="rounded-lg border border-slate-300 p-2 text-sm" />
                    )}
                    {imagePreviews.length > 0 && (
                      <div className="mt-1 grid grid-cols-3 gap-2">
                        {imagePreviews.map((preview, index) => (
                          <div key={index} className="relative group">
                            <img src={preview} alt={`Preview ${index + 1}`}
                              className="h-20 w-full rounded-lg object-cover border border-slate-200" />
                            <button type="button" onClick={() => removeImage(index)}
                              className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition hover:bg-red-600 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                            <span className="absolute bottom-1 left-1 rounded bg-black/40 px-1 text-[10px] text-white">{index + 1}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {message && (
              <p className={`text-sm font-medium ${message.includes("success") ? "text-emerald-600" : "text-rose-600"}`}>
                {message}
              </p>
            )}

            <button type="submit" disabled={!selectedCatalogueKey}
              className="w-full rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed sm:w-fit transition-colors">
              Save Entry
            </button>
          </form>
        )}
          </div>
        )}
      </div>
    </div>
  )
}

export default StockEntryPage
