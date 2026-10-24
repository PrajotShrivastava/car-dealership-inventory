# Multi-dealership (multi-tenancy): assessment and plan

**Status: proposed, not implemented.** DriveStock today serves a **single dealership**. This document records why the current design can't safely host several dealerships, and the recommended way to get there.

## Current state

| Area | Today | Problem for multiple dealerships |
|---|---|---|
| Data ownership | `users`, `vehicles`, `purchases` have no owner column | Every user sees and can buy from one shared inventory |
| Admin role | `role = admin` is global | One dealership's admin could edit or delete another's vehicles |
| Sign-in token | JWT holds only the user ID (`sub`) | No dealership context per request |
| Registration | Open sign-up creates a customer in the single store | No way to create a dealership or join a specific one |
| Uniqueness | Emails unique system-wide | Fine, but should be a deliberate choice (see below) |
| Enforcement | Queries aren't scoped | Nothing limits a request to one dealership's rows |
| Tests | No cross-dealership tests | Isolation is unverified |

## Recommended approach: shared database, `dealership_id` on every row

Chosen over a schema per dealership or a database per dealership. Those isolate more strongly but cost far more in migrations, connection management and operations than this product needs at its stage.

### Schema
- New `dealerships` table: `id`, `name`, `slug` (unique), `created_at`.
- Add `dealership_id` (NOT NULL, FK → dealerships) to `users`, `vehicles`, `purchases`.
- Composite indexes led by `dealership_id`, e.g. `(dealership_id, make, model)`, `(dealership_id, price)`.
- Roles per dealership: `owner`, `admin`, `customer`.
- Email uniqueness: **system-wide** (simplest: one login maps to one dealership). Switch to `UNIQUE (dealership_id, email)` only if a person needs accounts at several dealerships.

### Migration (Alembic, reversible)
1. Create `dealerships` and insert a "Default dealership".
2. Add nullable `dealership_id` columns and backfill every row to the default dealership.
3. Make the columns `NOT NULL`; add FKs and indexes.

### Enforcement (defence in depth)
1. **Application layer:** a single `get_current_tenant` dependency derives the dealership from the **authenticated user's database record**, never from client input. Every service query filters by it. Another dealership's vehicle returns **404**, so its existence isn't revealed.
2. **Database layer:** PostgreSQL **row-level security** on tenant tables. Each request's transaction runs `SET LOCAL app.dealership_id = …`, and policies restrict rows to that value. A missed filter then fails closed.
3. The purchase and restock `UPDATE … WHERE` statements gain a `dealership_id` condition, so the atomic oversell protection holds per dealership.

### Onboarding
- **Get Started (dealership):** creates a dealership and its `owner` in one transaction.
- **Customers** sign up through a dealership's public link, `/d/{slug}/signup`. The slug resolves the dealership server-side.
- Owners and admins invite staff (out of scope until needed).

### Tests required before shipping
- For **every endpoint**: a user from dealership A can't list, read, update, delete, purchase from or restock dealership B's data (404 or 403 as appropriate).
- Counts and search results never include other dealerships' rows.
- RLS test: a deliberately unscoped query returns zero foreign rows.
- Migration test: upgrade and downgrade with existing data in place.

### Explicitly out of scope
Subscription billing, plan limits, per-dealership custom domains and cross-dealership reporting.
