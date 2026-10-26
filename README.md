## Tech stack

- Frontend: React (Vite)
- Backend: Node.js + Express, Prisma 7 (driver adapter `pg`)
- Database: PostgreSQL on Neon
- Access control: low-privilege database roles per tier (`medipharm_admin`, `medipharm_staff`,
  `medipharm_patient`). The API logs in as `medipharm_app` and runs each request in a
  transaction that starts with `SET LOCAL ROLE`.

## Project layout

| Folder | Contents |
|--------|----------|
| `migrations/` | SQL files `001`-`004`: tables, roles, audit triggers, stored procedures |
| `seeds/` | `sample_data.sql`: test data |
| `backend/` | Express API |
| `frontend/` | React app |
| `docs/` | ERD and `api-endpoints.md` (the API plan) |

## Setup

Requirements: Node.js 20 or newer, Git, and access to the team's Neon project.

### 1. Database (once per Neon database)

The SQL files in `migrations/` are the real migrations. Open the Neon SQL Editor and run them
in order: `001`, `002`, `003`, `004`, then `seeds/sample_data.sql`.

**Do not run `prisma migrate`.** Prisma only reads the existing tables.

### 2. Backend

```powershell
cd backend
npm install
copy .env.example .env
npx prisma generate
```

Edit `backend/.env`:

- `DATABASE_URL`: the `medipharm_app` connection string. Ask the team lead for the password.
  Never commit this file or share the password in a screenshot.
- `ALLOW_DEV_AUTH=true`: local testing only. Real login is not built yet, so requests send
  `x-dev-role` (`admin`, `staff` or `patient`) and `x-dev-user-id` headers instead.

Start the API:

```powershell
npm start
```

Check `http://localhost:3000/health`. It should return `{"ok":true}`.

Try an endpoint:

```powershell
$h = @{ 'x-dev-role' = 'staff'; 'x-dev-user-id' = '2' }
Invoke-RestMethod http://localhost:3000/medicines -Headers $h
```

All endpoints are listed in [docs/api-endpoints.md](docs/api-endpoints.md).

### 3. Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## Working on the shared database

Everyone uses the same Neon database. `POST /prescriptions/:id/dispense` and
`POST /branches/:branchId/restock` change real data, so tell the team before testing them.
Reset the sample data afterwards:

```sql
UPDATE prescription_items SET quantity_dispensed = 0, item_status = 'pending'
 WHERE prescription_id IN (2, 3, 4);
UPDATE prescriptions SET status = 'pending' WHERE prescription_id IN (2, 3, 4);
UPDATE branches_stock SET quantity = CASE medicine_id
    WHEN 3 THEN 200 WHEN 4 THEN 100 WHEN 5 THEN 8
    WHEN 6 THEN 0   WHEN 7 THEN 50  WHEN 8 THEN 30 END
 WHERE branch_id = 3;
```

The IDs above come from the first run of `sample_data.sql`. If yours differ, look them up first.

## Team rules

- Branch from `main`, one small change per branch (`feature/...`, `docs/...`, `fix/...`).
- Open a pull request into `main`. Someone other than the author reviews it.
- Never commit `.env`, `node_modules/` or `backend/generated/`.
- A new database change is a new numbered file (`005_...`). Do not edit a migration that
  has already been run.