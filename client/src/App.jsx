import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './layout/AppLayout'
import InventoryPage from './pages/InventoryPage'
import StockEntryPage from './pages/StockEntryPage'
import AdminPage from './pages/AdminPage'
import FullHistoryPage from './pages/FullHistoryPage'
import ReportsPage from './pages/ReportsPage'
import PurchaseOrdersPage from './pages/PurchaseOrdersPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Navigate to="/reports" replace />} />
        <Route path="/dashboard" element={<Navigate to="/reports" replace />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/stock-entry" element={<StockEntryPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/inventory-history" element={<FullHistoryPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/purchase-orders" element={<PurchaseOrdersPage />} />
        <Route path="/history" element={<Navigate to="/inventory-history" replace />} />
      </Route>
    </Routes>
  )
}

export default App
