# MediPharm Network: API Endpoint Plan

Draft for team review. Frontend (React) and backend (Express + Prisma) are both built
from this list, so change it here first if something needs to change.

## Conventions

- Base URL (local): `http://localhost:3000`
- All requests and responses are JSON.
- After login, every request sends `Authorization: Bearer <token>`.
- IDs in URLs are numbers (`/prescriptions/2`).
- Field names in JSON use camelCase (`medicineId`); database columns stay snake_case.

### Roles and database roles

Each request runs in one transaction that starts with `SET LOCAL ROLE`.
The role name comes from a fixed map in the server code, never from user input.

| App role  | Database role          | Notes |
|-----------|------------------------|-------|
| `admin`   | `medipharm_admin`      | |
| `staff`   | `medipharm_staff`      | pharmacists and doctors |
| `patient` | _confirm name in 002_  | check `migrations/002_create_roles.sql` |

The API connects as `medipharm_app` and switches role inside the transaction.
`user_account.role` decides which database role a logged-in user gets.

### Error format

```json
{ "error": "Prescription 999 not found" }
```

| Status | Meaning |
|--------|---------|
| 400 | Bad input (missing field, quantity not greater than 0) |
| 401 | Not logged in |
| 403 | Logged in, but the role is not allowed (including a database "permission denied") |
| 404 | Record not found |
| 409 | Conflict (already dispensed, doctor already booked) |
| 500 | Anything else |

## Auth

| Method | Path | Who | Purpose |
|--------|------|-----|---------|
| POST | `/auth/login` | anyone | Email and password in, token and user out |
| GET | `/auth/me` | any logged-in user | Current user and role |

`POST /auth/login` request:

```json
{ "email": "seed.pharmacist@medipharm.test", "password": "..." }
```

Response:

```json
{ "token": "...", "user": { "userId": 2, "role": "staff", "email": "..." } }
```

Passwords are checked against `user_account.password_hash` (bcrypt). The sample data uses
placeholder hashes, so sample accounts cannot log in until real hashes are set.

## Medicines and stock

| Method | Path | Who | Purpose |
|--------|------|-----|---------|
| GET | `/medicines` | staff, admin | List all medicines |
| GET | `/branches` | staff, admin | List pharmacy branches |
| GET | `/branches/:branchId/stock` | staff, admin | Stock for one branch, with each medicine's reorder threshold |
| POST | `/branches/:branchId/restock` | staff, admin | Add stock (calls `sp_restock_branch`) |

`POST /branches/:branchId/restock` request:

```json
{ "medicineId": 3, "quantity": 100 }
```

Response: `{ "ok": true }`. The logged-in user's ID is passed to the procedure as `p_user_id`.
Errors: 400 if `quantity` is not greater than 0.

## Prescriptions

| Method | Path | Who | Purpose |
|--------|------|-----|---------|
| GET | `/prescriptions` | staff, admin (all); patient (own only) | List. Optional filters: `?status=pending&branchId=1` |
| GET | `/prescriptions/:id` | same as above | One prescription with its items |
| POST | `/prescriptions/:id/dispense` | staff | Dispense from branch stock (calls `sp_dispense_prescription`) |

`GET /prescriptions/:id` response:

```json
{
  "prescriptionId": 3,
  "status": "pending",
  "branchId": 1,
  "items": [
    { "medicineId": 3, "name": "Allerta", "quantityRequested": 30,
      "quantityDispensed": 0, "itemStatus": "pending" }
  ]
}
```

`POST /prescriptions/:id/dispense` has no request body. Response:

```json
{
  "result": "Prescription 3 is now partially_dispensed",
  "prescription": { "prescriptionId": 3, "status": "partially_dispensed", "items": [ ... ] }
}
```

The procedure gives out only what is in stock. A short or empty stock is a normal result
(status 200 with `partially_dispensed` or `out_of_stock` items), not an error.

Procedure errors and the HTTP status they map to:

| Procedure message | Status |
|-------------------|--------|
| `Prescription N not found` | 404 |
| `Prescription N is already dispensed` / `cancelled` | 409 |
| `Prescription N has no items` | 400 |
| `User N does not exist or is inactive` | 401 |

## Appointments (planned)

Depends on the appointment-conflict procedure, which is still to be written.

| Method | Path | Who | Purpose |
|--------|------|-----|---------|
| GET | `/appointments` | staff, admin (all); patient (own only) | List appointments |
| POST | `/appointments` | patient, staff | Book a slot. 409 if the doctor is already booked at that date and time |

## Alerts and audit

| Method | Path | Who | Purpose |
|--------|------|-----|---------|
| GET | `/alerts/low-stock` | staff, admin | Unresolved rows from `low_stock_alerts` |
| GET | `/audit-logs` | admin | Recent rows from `audit_logs`. Optional `?table=prescriptions&recordId=2` |

## Open questions for the team

1. Which database role do patients use? Confirm the exact name in `002`.
2. Should patients be able to see their own prescriptions, or is the app staff and admin only?
3. Should procedures raise errors with their own error codes, so the API does not have to
   match on message text?
4. Who writes the raw SQL calls to the procedures, and who writes the routes around them?
