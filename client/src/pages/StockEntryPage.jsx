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
    const selected = Array.from(event.target.files || [])
    setForm((prev) => ({ ...prev, images: selected.slice(0, 3) }))
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
      <form onSubmit={onSubmit} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
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
            <option value="adjustment">Adjustment</option>
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
            Where From *
            <select name="source" value={form.source} onChange={onChange} className="rounded-lg border border-slate-300 px-3 py-2">
              <option value="">Select manufacturer</option>
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
            Where To *
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

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Upload Images (max 3)
          <input type="file" accept="image/*" multiple onChange={onFileChange} className="rounded-lg border border-slate-300 p-2" />
        </label>

        {message ? <p className="text-sm text-indigo-700">{message}</p> : null}

        <button type="submit" className="w-fit rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
          Save Entry
        </button>
      </form>
    </div>
  )
}

export default StockEntryPage
