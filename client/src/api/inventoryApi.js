import { apiClient } from "./apiClient"

export const fetchDashboardStats = async () => {
  const { data } = await apiClient.get("/dashboard/stats")
  return data
}

export const fetchStockMovement = async () => {
  const { data } = await apiClient.get("/dashboard/stock-movement")
  return data
}

export const fetchProducts = async () => {
  const { data } = await apiClient.get("/products")
  return data
}

export const createProduct = async (payload) => {
  const { data } = await apiClient.post("/products", payload)
  return data
}

export const fetchManufacturers = async () => {
  const { data } = await apiClient.get("/manufacturers")
  return data
}

export const createManufacturer = async (payload) => {
  const { data } = await apiClient.post("/manufacturers", payload)
  return data
}

export const updateManufacturer = async (id, payload) => {
  const { data } = await apiClient.put(`/manufacturers/${id}`, payload)
  return data
}

export const deleteManufacturer = async (id) => {
  await apiClient.delete(`/manufacturers/${id}`)
}

export const fetchDestinations = async () => {
  const { data } = await apiClient.get("/destinations")
  return data
}

export const createDestination = async (payload) => {
  const { data } = await apiClient.post("/destinations", payload)
  return data
}

export const updateDestination = async (id, payload) => {
  const { data } = await apiClient.put(`/destinations/${id}`, payload)
  return data
}

export const deleteDestination = async (id) => {
  await apiClient.delete(`/destinations/${id}`)
}

export const updateProduct = async (id, payload) => {
  const { data } = await apiClient.put(`/products/${id}`, payload)
  return data
}

export const deleteProduct = async (id) => {
  await apiClient.delete(`/products/${id}`)
}

export const createInventoryEntry = async (formData) => {
  const { data } = await apiClient.post("/inventory-entries", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return data
}

export const fetchInventoryEntries = async (params = {}) => {
  const { data } = await apiClient.get("/inventory-entries", { params })
  return data
}

export const fetchRecentInventoryEntries = async (limit = 7) => {
  const data = await fetchInventoryEntries({ page: 1, limit })
  return data
}
