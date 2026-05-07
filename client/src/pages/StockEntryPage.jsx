import { useEffect, useMemo, useState } from "react"
import {
  bulkAddInventory,
  bulkRemoveInventory,
  createInventoryEntry,
  fetchDestinations,
  fetchManufacturers,
  fetchProducts,
} from "../api/inventoryApi"

// ── Product catalogue (for ADD / RECOUNT item filtering) ──────────────────
const PRODUCT_CATALOGUE = [
  {
    key: "ele",
    label: "Ele Ring Silicone Teether Set",
    image: "https://res.cloudinary.com/dgqcdiyad/image/upload/f_auto,q_auto/ele-teether-blue-beige__wljswi",
    items: [
      "Sage Green Teether", "Aqua Blue Teether", "Slate Grey Teether",
      "Oat Beige Teether", "Baby Pink Teether",
      "Ele Box", "Ele Thank You Card", "Potli",
    ],
  },
  {
    key: "kiko",
    label: "Kiko No Drop Teether",
    image: "https://res.cloudinary.com/dgqcdiyad/image/upload/f_auto,q_auto/kiko_teether_baby_hand_green_b23ujn",
    items: [
      "Sage Green Kiko Teether", "Cloud White Kiko Teether",
      "Kiko Box", "Thank You Card", "Potli",
    ],
  },
  {
    key: "cloth",
    label: "Cloth Book Set",
    image: "https://res.cloudinary.com/dgqcdiyad/image/upload/f_auto,q_auto/cloth_book_uu9rnk",
    items: [
      "My First Patterns Book", "My First Faces Book", "My First Puzzles Book",
      "Book Kit Sleeve", "Book Kit Thank You Card",
    ],
  },
  {
    key: "newborn",
    label: "Newborn Gift Kit",
    image: "https://res.cloudinary.com/dgqcdiyad/image/upload/f_auto,q_auto/montessori_kit_gysxiw",
    items: [
      "Flashcards", "Ribbon", "Cloth Book", "Banner",
      "Gift Kit Sleeve", "Gift Kit Thank You Card",
    ],
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

// ── Corrugation flow component — simple add to "Corrugation Box" stock ──────
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
      // Add directly to "Corrugation Box" item via bulk-add
      await bulkAddInventory({
        additions: [{ name: "Corrugation Box", quantity: Number(boxes) }],
        source,
        remarks,
        images,
        entry_date: entryDate,
      })
      setMessage("✓ Corrugation boxes added successfully.")
      setBoxes("")
      setSource("")
      setRemarks("")
      setEntryDate(today)
      imagePreviews.forEach((u) => URL.revokeObjectURL(u))
      setImages([])
      setImagePreviews([])
      setFileInputKey((k) => k + 1)
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
        <input
          type="number"
          min="1"
          value={boxes}
          onChange={(e) => setBoxes(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2"
          placeholder="e.g. 10"
        />
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
          {manufacturers.map((m) => (
            <option key={m.id} value={m.name}>{m.name}</option>
          ))}
        </select>
      </label>

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
          Images (max 3){images.length > 0 && <span className="font-normal text-slate-400"> — {images.length} selected</span>}
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
        <p className={`text-sm font-medium ${message.startsWith("✓") ? "text-emerald-600" : "text-rose-600"}`}>
          {message}
        </p>
      )}

      <button type="submit"
        disabled={submitting || !boxes || Number(boxes) <= 0 || !source}
        className="w-full rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed sm:w-fit transition-colors">
        {submitting ? "Adding..." : "Confirm Add"}
      </button>
    </form>
  )
}

// ── Blue Box flow component — simple add to "Blue Box" stock ──────────────
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
          {manufacturers.map((m) => (<option key={m.id} value={m.name}>{m.name}</option>))}
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
          Images (max 3){images.length > 0 && <span className="font-normal text-slate-400"> — {images.length} selected</span>}
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
        <p className={`text-sm font-medium ${message.startsWith("✓") ? "text-emerald-600" : "text-rose-600"}`}>
          {message}
        </p>
      )}

      <button type="submit" disabled={submitting || !qty || Number(qty) <= 0 || !source}
        className="w-full rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed sm:w-fit transition-colors">
        {submitting ? "Adding..." : "Confirm Add"}
      </button>
    </form>
  )
}

const REMOVE_PRODUCTS = [
  {
    key: "ele",
    label: "Ele Ring Silicone Teether Set",
    image: "https://res.cloudinary.com/dgqcdiyad/image/upload/f_auto,q_auto/ele-teether-blue-beige__wljswi",
    variants: [
      { key: "sg_ab", label: "Sage Green + Aqua Blue",    colors: ["Sage Green Teether", "Aqua Blue Teether"] },
      { key: "bp_ob", label: "Baby Pink + Oat Beige",     colors: ["Baby Pink Teether", "Oat Beige Teether"] },
      { key: "sg_sg", label: "Sage Green + Slate Grey",   colors: ["Sage Green Teether", "Slate Grey Teether"] },
      { key: "ab_ob", label: "Aqua Blue + Oat Beige",     colors: ["Aqua Blue Teether", "Oat Beige Teether"] },
      { key: "ab_bp", label: "Aqua Blue + Baby Pink",     colors: ["Aqua Blue Teether", "Baby Pink Teether"] },
      { key: "sg_ob", label: "Sage Green + Oat Beige",    colors: ["Sage Green Teether", "Oat Beige Teether"] },
      { key: "sg_bp", label: "Sage Green + Baby Pink",    colors: ["Sage Green Teether", "Baby Pink Teether"] },
    ],
    // colors come from variant selection, rest are fixed
    fixedItems: ["Potli", "Ele Box", "Ele Thank You Card"],
  },
  {
    key: "kiko",
    label: "Kiko No Drop Teether",
    image: "https://res.cloudinary.com/dgqcdiyad/image/upload/f_auto,q_auto/kiko_teether_baby_hand_green_b23ujn",
    variants: [
      { key: "sg", label: "Sage Green",  colors: ["Sage Green Kiko Teether"] },
      { key: "cw", label: "Cloud White", colors: ["Cloud White Kiko Teether"] },
    ],
    fixedItems: ["Kiko Box", "Thank You Card", "Potli"],
  },
  {
    key: "cloth",
    label: "Cloth Book Set",
    image: "https://res.cloudinary.com/dgqcdiyad/image/upload/f_auto,q_auto/cloth_book_uu9rnk",
    variants: null,
    fixedItems: [
      "My First Patterns Book", "My First Faces Book", "My First Puzzles Book",
      "Book Kit Sleeve", "Book Kit Thank You Card",
    ],
  },
  {
    key: "newborn",
    label: "Newborn Gift Kit",
    image: "https://res.cloudinary.com/dgqcdiyad/image/upload/f_auto,q_auto/montessori_kit_gysxiw",
    variants: null,
    fixedItems: [
      { name: "Flashcards", multiplier: 10 },
      "Cloth Book", "Banner",
      "Gift Kit Sleeve", "Gift Kit Thank You Card",
    ],
  },
]

// Build deduction list from selected remove product + variant + quantity
function buildDeductions(productKey, variantKey, quantity) {
  const Q = Number(quantity)
  const rp = REMOVE_PRODUCTS.find((p) => p.key === productKey)
  if (!rp) return []

  const items = []

  // Add color/variant items
  if (rp.variants && variantKey) {
    const variant = rp.variants.find((v) => v.key === variantKey)
    if (variant) {
      variant.colors.forEach((name) => items.push({ name, quantity: Q }))
    }
  }

  // Add fixed items
  rp.fixedItems.forEach((item) => {
    if (typeof item === "string") {
      items.push({ name: item, quantity: Q })
    } else {
      // object with multiplier (e.g. Flashcards × 10)
      items.push({ name: item.name, quantity: Q * item.multiplier })
    }
  })

  return items
}

// ── Shared UI: Product card ────────────────────────────────────────────────
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
        <img
          src={item.image}
          alt={item.label}
          className="h-full w-full object-cover"
          onError={(e) => { e.target.style.display = "none" }}
        />
        {selected && (
          <div className="absolute inset-0 flex items-center justify-center bg-indigo-500/20">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500 text-white text-xs font-bold">✓</span>
          </div>
        )}
      </div>
      <p className={`text-xs font-medium leading-tight ${selected ? "text-indigo-700" : "text-slate-700"}`}>
        {item.label}
      </p>
    </button>
  )
}

// ── REMOVE flow component ─────────────────────────────────────────────────
function RemoveFlow({ destinations }) {
  const today = new Date().toISOString().split("T")[0]
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [selectedVariant, setSelectedVariant] = useState(null)
  const [quantity, setQuantity] = useState("")
  const [destination, setDestination] = useState("")
  const [remarks, setRemarks] = useState("")
  const [entryDate, setEntryDate] = useState(today)
  const [images, setImages] = useState([])
  const [imagePreviews, setImagePreviews] = useState([])
  const [fileInputKey, setFileInputKey] = useState(0)
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const rp = REMOVE_PRODUCTS.find((p) => p.key === selectedProduct)

  const deductions = useMemo(() => {
    if (!selectedProduct || !quantity || Number(quantity) <= 0) return []
    if (rp?.variants && !selectedVariant) return []
    return buildDeductions(selectedProduct, selectedVariant, quantity)
  }, [selectedProduct, selectedVariant, quantity, rp])

  const handleProductSelect = (key) => {
    setSelectedProduct(key)
    setSelectedVariant(null)
    setQuantity("")
    setMessage("")
  }

  const onFileChange = (event) => {
    const incoming = Array.from(event.target.files || [])
    const combined = [...images, ...incoming].slice(0, 3)
    imagePreviews.forEach((url) => URL.revokeObjectURL(url))
    setImages(combined)
    setImagePreviews(combined.map((f) => URL.createObjectURL(f)))
    setFileInputKey((k) => k + 1)
  }

  const removeImagePreview = (index) => {
    URL.revokeObjectURL(imagePreviews[index])
    setImages((prev) => prev.filter((_, i) => i !== index))
    setImagePreviews((prev) => prev.filter((_, i) => i !== index))
    setFileInputKey((k) => k + 1)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedProduct) { setMessage("Please select a product."); return }
    if (rp?.variants && !selectedVariant) { setMessage("Please select a variant."); return }
    if (!quantity || Number(quantity) <= 0) { setMessage("Please enter a valid quantity."); return }
    if (!destination) { setMessage("Please select a destination."); return }

    setSubmitting(true)
    setMessage("")
    try {
      await bulkRemoveInventory({ deductions, destination, remarks, images, entry_date: entryDate })
      setMessage("✓ Stock removed successfully.")
      setSelectedProduct(null)
      setSelectedVariant(null)
      setQuantity("")
      setDestination("")
      setRemarks("")
      setEntryDate(today)
      imagePreviews.forEach((url) => URL.revokeObjectURL(url))
      setImages([])
      setImagePreviews([])
      setFileInputKey((k) => k + 1)
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to remove stock. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6">

      {/* Step 1 — Product */}
      <div className="grid gap-3">
        <p className="text-sm font-semibold text-slate-700">Step 1 — Select product *</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {REMOVE_PRODUCTS.map((p) => (
            <ProductCard key={p.key} item={p} selected={selectedProduct === p.key} onSelect={handleProductSelect} />
          ))}
        </div>
      </div>

      {/* Step 2 — Variant (only for Ele and Kiko) */}
      {rp?.variants && (
        <>
          <div className="h-px bg-slate-100" />
          <div className="grid gap-3">
            <p className="text-sm font-semibold text-slate-700">Step 2 — Select variant *</p>
            <div className="flex flex-wrap gap-2">
              {rp.variants.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setSelectedVariant(v.key)}
                  className={`rounded-lg border-2 px-4 py-2 text-sm font-medium transition-all ${
                    selectedVariant === v.key
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Step 3 — Quantity + Destination */}
      {selectedProduct && (!rp?.variants || selectedVariant) && (
        <>
          <div className="h-px bg-slate-100" />
          <div className="grid gap-4">
            <p className="text-sm font-semibold text-slate-700">
              {rp?.variants ? "Step 3" : "Step 2"} — Details
            </p>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Quantity to remove *
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2"
                placeholder="e.g. 5"
              />
            </label>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Destination *
              <select
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="">Select destination</option>
                {destinations.map((d) => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Remarks
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows="2"
                className="rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>

            {/* Images */}
            <div className="grid gap-2">
              <p className="text-sm font-medium text-slate-700">
                Images (max 3){" "}
                {images.length > 0 && (
                  <span className="font-normal text-slate-400">— {images.length} selected</span>
                )}
              </p>
              {images.length < 3 && (
                <input
                  key={fileInputKey}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={onFileChange}
                  className="rounded-lg border border-slate-300 p-2 text-sm"
                />
              )}
              {imagePreviews.length > 0 && (
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {imagePreviews.map((preview, index) => (
                    <div key={index} className="relative group">
                      <img src={preview} alt={`Preview ${index + 1}`}
                        className="h-20 w-full rounded-lg object-cover border border-slate-200" />
                      <button
                        type="button"
                        onClick={() => removeImagePreview(index)}
                        className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition hover:bg-red-600 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                      >
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

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Date *
              <input
                type="date"
                value={entryDate}
                max={today}
                onChange={(e) => setEntryDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          {/* Deduction preview */}
          {deductions.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="mb-3 text-sm font-semibold text-amber-800">This will deduct:</p>
              <div className="grid gap-1.5">
                {deductions.map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{d.name}</span>
                    <span className="font-semibold text-rose-600">− {d.quantity}</span>
                  </div>
                ))}
                {/* Auto-deducted items */}
                {(selectedProduct === "cloth" || selectedProduct === "newborn") && quantity && Number(quantity) > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 italic">Blue Box (auto)</span>
                    <span className="font-semibold text-rose-400">− {Number(quantity)}</span>
                  </div>
                )}
                {selectedProduct === "newborn" && quantity && Number(quantity) > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 italic">Ribbon (auto) — meters</span>
                    <span className="font-semibold text-rose-400">− {Number(quantity)}m</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {message && (
        <p className={`text-sm font-medium ${message.startsWith("✓") ? "text-emerald-600" : "text-rose-600"}`}>
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || deductions.length === 0 || !destination}
        className="w-full rounded-lg bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed sm:w-fit transition-colors"
      >
        {submitting ? "Removing..." : "Confirm Remove"}
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
    if (form.type === "remove") return "destination"
    return "adjustment"
  }, [form.type])

  const onChange = (event) => {
    const { name, value } = event.target
    // Reset catalogue selection when switching away from remove
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

  // Action tabs
  const actionTabs = [
    { value: "add",        label: "Add",     color: "emerald" },
    { value: "remove",     label: "Remove",  color: "rose" },
    { value: "adjustment", label: "Recount", color: "amber" },
  ]

  const tabColors = {
    emerald: { active: "bg-emerald-600 text-white border-emerald-600", inactive: "border-slate-300 text-slate-600 hover:border-emerald-400" },
    rose:    { active: "bg-rose-600 text-white border-rose-600",       inactive: "border-slate-300 text-slate-600 hover:border-rose-400" },
    amber:   { active: "bg-amber-500 text-white border-amber-500",     inactive: "border-slate-300 text-slate-600 hover:border-amber-400" },
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

        {/* REMOVE flow */}
        {form.type === "remove" && (
          <RemoveFlow destinations={destinations} />
        )}

        {/* ADD / RECOUNT flow */}
        {form.type !== "remove" && (
          <form onSubmit={onSubmit} className="grid gap-6">

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

            {/* Corrugation flow */}
            {isCorrugation && (
              <>
                <div className="h-px bg-slate-100" />
                <CorrugationFlow manufacturers={manufacturers} />
              </>
            )}

            {/* Blue Box flow */}
            {isBlueBox && (
              <>
                <div className="h-px bg-slate-100" />
                <BlueBoxFlow manufacturers={manufacturers} />
              </>
            )}

            {/* Regular item form — hidden when special card selected */}
            {selectedCatalogueKey && !isSpecialCard && (
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
                    <select
                      name="product_id"
                      value={form.product_id}
                      onChange={onChange}
                      className="rounded-lg border border-slate-300 px-3 py-2"
                    >
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
                      const selectedItem = filteredProducts.find(p => String(p.id) === String(form.product_id))
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
                        filteredProducts.find(p => String(p.id) === String(form.product_id))?.name?.toLowerCase() === "ribbon"
                          ? "e.g. 100 meters"
                          : ""
                      }
                    />
                  </label>

                  {typeFields === "source" && (
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      From *
                      <select name="source" value={form.source} onChange={onChange} className="rounded-lg border border-slate-300 px-3 py-2">
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
                    <input
                      name="entry_date"
                      type="date"
                      value={form.entry_date}
                      max={today}
                      onChange={onChange}
                      className="rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </label>

                  {/* Images */}
                  <div className="grid gap-2">
                    <p className="text-sm font-medium text-slate-700">
                      Images (max 3){" "}
                      {form.images.length > 0 && (
                        <span className="font-normal text-slate-400">— {form.images.length} selected</span>
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

            {!isSpecialCard && (
              <button type="submit" disabled={!selectedCatalogueKey}
                className="w-full rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed sm:w-fit transition-colors">
                Save Entry
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  )
}

export default StockEntryPage