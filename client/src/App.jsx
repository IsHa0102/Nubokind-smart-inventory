import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './layout/AppLayout'
import DashboardPage from './pages/DashboardPage'
import InventoryPage from './pages/InventoryPage'
import StockEntryPage from './pages/StockEntryPage'
import AdminPage from './pages/AdminPage'
import FullHistoryPage from './pages/FullHistoryPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/stock-entry" element={<StockEntryPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/inventory-history" element={<FullHistoryPage />} />
        <Route path="/history" element={<Navigate to="/inventory-history" replace />} />
      </Route>
    </Routes>
  )
}

export default App
