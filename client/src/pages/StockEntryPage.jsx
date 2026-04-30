import { useEffect, useMemo, useState } from "react"
import {
  createInventoryEntry,
  fetchDestinations,
  fetchManufacturers,
  fetchProducts,
} from "../api/inventoryApi"

function StockEntryPage() {
  const [products, setProducts] = useState([])
  const [manufacturers, setManufacturers] = useState([])
  const [destinations, setDestinations] = useState([])
  const [message, setMessage] = useState("")
  const [form, setForm] = useState({
    product_id: "",
    type: "add",
    quantity: "",
    source: "",
    destination: "",
    remarks: "",
    images: [],
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

  const typeFields = useMemo(() => {
    if (form.type === "add") return "source"
    if (form.type === "remove") return "destination"
    return "adjustment"
  }, [form.type])

  const onChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const onFileChange = (event) => {
    const incoming = Array.from(event.target.files || [])
    // Merge with existing images, cap at 3
    const combined = [...form.images, ...incoming].slice(0, 3)
    // Revoke old preview URLs before creating new ones
    imagePreviews.forEach((url) => URL.revokeObjectURL(url))
    const previews = combined.map((file) => URL.createObjectURL(file))
    setForm((prev) => ({ ...prev, images: combined }))
    setImagePreviews(previews)
    // Reset input value so the same file can be added again if needed
    setFileInputKey((k) => k + 1)
  }

  const removeImage = (index) => {
    URL.revokeObjectURL(imagePreviews[index])
    const newImages = form.images.filter((_, i) => i !== index)
    const newPreviews = imagePreviews.filter((_, i) => i !== index)
    setForm((prev) => ({ ...prev, images: newImages }))
    setImagePreviews(newPreviews)
    setFileInputKey((k) => k + 1)
  }

  const validate = () => {
    if (!form.product_id || !form.quantity) return "Please fill required fields."
    if (Number(form.quantity) <= 0) return "Quantity must be greater than 0."
    if (form.type === "add" && !form.source) return "Please select where stock came from."
    if (form.type === "remove" && !form.destination) return "Please select where stock is going."
    if (form.images.length > 3) return "Maximum 3 images allowed."
    return ""
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    const error = validate()
    if (error) {
      setMessage(error)
      return
    }

    const payload = new FormData()
    payload.append("product_id", form.product_id)
    payload.append("type", form.type)
    payload.append("quantity", form.quantity)
    payload.append("remarks", form.remarks)
    if (form.type === "add") payload.append("source", form.source)
    if (form.type === "remove") payload.append("destination", form.destination)
    form.images.forEach((image) => payload.append("images", image))

    await createInventoryEntry(payload)
    setMessage("Stock entry saved successfully.")
    imagePreviews.forEach((url) => URL.revokeObjectURL(url))
    setImagePreviews([])
    setFileInputKey((k) => k + 1)
    setForm({
      product_id: "",
      type: "add",
      quantity: "",
      source: "",
      destination: "",
      remarks: "",
      images: [],
    })
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">Stock Entry</h2>
      <form onSubmit={onSubmit} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Product *
          <select
            name="product_id"
            value={form.product_id}
            onChange={onChange}
            className="rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="">Select product</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Action *
          <select name="type" value={form.type} onChange={onChange} className="rounded-lg border border-slate-300 px-3 py-2">
            <option value="add">Add</option>
            <option value="remove">Remove</option>
            <option value="adjustment">Recount</option>
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Quantity *
          <input
            name="quantity"
            type="number"
            min="1"
            value={form.quantity}
            onChange={onChange}
            className="rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>

        {typeFields === "source" ? (
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            From *
            <select name="source" value={form.source} onChange={onChange} className="rounded-lg border border-slate-300 px-3 py-2">
              <option value="">Select source</option>
              {manufacturers.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {typeFields === "destination" ? (
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            To *
            <select
              name="destination"
              value={form.destination}
              onChange={onChange}
              className="rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="">Select destination</option>
              {destinations.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Remarks
          <textarea
            name="remarks"
            value={form.remarks}
            onChange={onChange}
            rows="4"
            className="rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>

        <div className="grid gap-2">
          <p className="text-sm font-medium text-slate-700">
            Images (max 3){" "}
            {form.images.length > 0 && (
              <span className="font-normal text-slate-400">— {form.images.length} selected</span>
            )}
          </p>
          {form.images.length < 3 && (
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
                  <img src={preview} alt={`Preview ${index + 1}`} className="h-20 w-full rounded-lg object-cover border border-slate-200" />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
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

        {message ? <p className="text-sm text-indigo-700">{message}</p> : null}

        <button type="submit" className="w-full rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 sm:w-fit">
          Save Entry
        </button>
      </form>
    </div>
  )
}

export default StockEntryPage
