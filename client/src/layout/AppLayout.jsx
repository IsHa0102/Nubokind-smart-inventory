import { NavLink, Outlet } from "react-router-dom"
import { GlobalSearch } from "../components/GlobalSearch"

const links = [
  { to: "/reports",            label: "Reports" },
  { to: "/inventory",          label: "Inventory" },
  { to: "/stock-entry",        label: "Stock Entry" },
  { to: "/planned-shipments",  label: "Order Planning" },
  { to: "/purchase-orders",    label: "Orders" },
  { to: "/inventory-history",  label: "History" },
  { to: "/admin",              label: "Admin" },
]

function AppLayout() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:gap-4">
          <div className="flex shrink-0 items-center gap-3">
            <img src="https://res.cloudinary.com/dgqcdiyad/image/upload/q_auto/f_auto/v1779892935/nubo_logo_yellow_bg_t1rxsk.png" alt="Nübo" className="h-9 w-auto rounded-lg" />
            <h1 className="text-lg font-bold text-slate-900 sm:text-xl">Nubokind Smart Inventory System</h1>
          </div>
          <div className="w-full lg:max-w-xs xl:max-w-sm">
            <GlobalSearch />
          </div>
          <nav className="flex w-full gap-2 overflow-x-auto pb-1 lg:w-auto lg:flex-wrap lg:justify-end lg:overflow-visible lg:pb-0">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
                    isActive ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-100"
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
        <Outlet />
      </main>
    </div>
  )
}

export default AppLayout
