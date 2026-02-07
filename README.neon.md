# Neon Integration (Existing Structure)

This project keeps the original `pro.html` structure and adds a lightweight backend for Neon sync.

## What was added

- `server.js`:
  - Serves `pro.html`
  - Provides API:
    - `GET /api/state`
    - `PUT /api/state`
  - Stores state in normalized Postgres tables:
    - `snacks`
    - `customers`
    - `users`
    - `purchases`
  - Includes one-time migration from legacy `app_state` JSONB (if present and normalized tables are empty)
- `package.json` with `express`, `pg`, `dotenv`
- Frontend sync in `pro.html`:
  - Keeps localStorage behavior
  - Auto syncs to Neon when API is available
  - Falls back to local-only if API/DB is unavailable

## Run

1. Install dependencies:
   - `npm install`
2. Ensure `.env` has:
   - `DATABASE_URL=postgresql://...`
3. Start:
   - `npm start`
4. Open:
   - `http://localhost:3000`
