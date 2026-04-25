# Nubokind Smart Inventory System

Full-stack inventory management system with a clean UI for non-technical users.

## Tech Stack
- Frontend: React + Vite + Tailwind CSS
- Backend: Node.js + Express
- Database: PostgreSQL (Supabase compatible)

## Project Structure
- `client/` - React application
- `server/` - Express API
- `shared/` - shared type notes

## Features
- Dashboard metrics:
  - Total Stock
  - Low Stock
  - Out of Stock
  - Top Mover
- Stock movement line chart (last 7 days)
- Inventory table with stock status
- Dynamic stock entry form:
  - Add: quantity + where_from (manufacturer)
  - Remove: quantity + where_to (destination)
  - Adjustment: quantity
  - Remarks for all entry types
  - Max 3 images upload
- Admin management:
  - Add products
  - Manage manufacturers
  - Manage destinations

## Backend API Endpoints
- `GET /api/products`
- `POST /api/products`
- `PUT /api/products/:id`
- `DELETE /api/products/:id`
- `POST /api/inventory-entries`
- `GET /api/dashboard/stats`
- `GET /api/dashboard/stock-movement`
- `GET /api/manufacturers`
- `POST /api/manufacturers`
- `GET /api/destinations`
- `POST /api/destinations`

## Database Setup
1. Create a PostgreSQL database.
2. Run schema:
   - `server/sql/schema.sql`
3. Add environment values in `server/.env` based on `server/.env.example`.

Supabase compatible:
- Use your Supabase Postgres connection string in `DATABASE_URL`.
- Set `DB_SSL=true` if SSL is required.

## Environment Variables

### Server (`server/.env`)
```env
PORT=4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nubokind_inventory
DB_SSL=false
```

### Client (`client/.env`)
```env
VITE_API_BASE_URL=http://localhost:4000/api
```

## Run Locally

### 1) Install dependencies
```bash
cd server && npm install
cd ../client && npm install
```

### 2) Start backend
```bash
cd server
npm run dev
```

### 3) Start frontend
```bash
cd client
npm run dev
```

Frontend default URL: `http://localhost:5173`

## Notes
- Uploaded images are accepted and filenames are stored in database (`inventory_entries.images`).
- In production, connect file uploads to object storage (S3/Supabase Storage).
