# DriveStock — Car Dealership Inventory System

A full-stack inventory system for a car dealership. Customers browse, search and buy vehicles; admins manage listings, prices and stock. Built test-first with a FastAPI + PostgreSQL REST API and a React + TypeScript + Tailwind single-page app.

![Customer inventory](docs/screenshots/03-customer-inventory.png)

---

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Running the tests](#running-the-tests)
- [API documentation](#api-documentation)
- [Data model](#data-model)
- [Design decisions and trade-offs](#design-decisions-and-trade-offs)
- [Security notes](#security-notes)
- [Screenshots](#screenshots)
- [Test report](#test-report)
- [My AI Usage](#my-ai-usage)
- [Credits](#credits)

## Features

**Everyone (signed in)**
- Register and sign in (JWT bearer tokens); the session survives a reload
- Inventory list showing make, model, trim, year, spec line, price and a live stock badge (in stock / low stock / out of stock)
- Search (make, model, trim) and filters for category, price range and availability, with counts per availability state; filters live in the URL so a view can be shared
- Sorting (newest, price, year, make) and pagination
- Details drawer with full specifications and **purchase** (quantity stepper capped at available stock, purchase disabled at zero stock)

**Admins** (server-enforced)
- Add vehicles (with initial stock), edit details and price, **restock**, delete (with confirmation)
- Admin accounts can't be self-registered; they're created with a CLI command

**Guarantees**
- No overselling and no negative stock, even with concurrent buyers (atomic conditional `UPDATE` plus a database `CHECK`)
- Consistent JSON error format with field-level validation details
- Responsive layout: desktop, tablet (icon-rail sidebar), mobile (stacked cards, full-screen details sheet)

## Tech stack

| Layer | Choice |
|---|---|
| API | Python 3.12+ (developed on 3.14), FastAPI, Pydantic v2 |
| Persistence | PostgreSQL 17, SQLAlchemy 2, Alembic migrations, psycopg 3 |
| Auth | argon2 password hashing (`argon2-cffi`), HS256 JWT (`PyJWT`) |
| Web | React 19, TypeScript, Vite, Tailwind CSS v4, React Router, TanStack Query, lucide icons |
| Tests | pytest (+ real Postgres), Vitest + React Testing Library + MSW, Playwright |
| Quality | ruff, mypy `--strict`, oxlint, `tsc --noEmit`, GitHub Actions workflow |

## Architecture

```
┌──────────────────────────┐   HTTPS/JSON    ┌──────────────────────────────┐      ┌──────────────┐
│ React SPA (Vite)         │  Bearer token   │ FastAPI                      │ SQL  │ PostgreSQL 17│
│ pages → features → api/  │ ──────────────▶ │ routers → services → models  │ ───▶ │ users        │
│ TanStack Query cache     │ ◀────────────── │ Pydantic schemas, errors     │      │ vehicles     │
└──────────────────────────┘ {error:{code}}  └──────────────────────────────┘      │ purchases    │
                                                                                   └──────────────┘
```

```
backend/
  app/
    main.py            app factory, CORS, router registration
    config.py          settings from environment / .env
    db.py              engine + session dependency
    models.py          User, Vehicle, Purchase (+ enums)
    schemas/           request/response models and query validation
    routers/           auth.py, vehicles.py (thin HTTP layer)
    services/          inventory.py: search, purchase, restock (business rules)
    security.py        hashing, JWT, get_current_user, require_admin
    errors.py          AppError + JSON error handlers
    cli.py             create-admin, seed
  alembic/versions/    0001 users · 0002 vehicles · 0003 purchases
  scripts/             prepare_e2e_db.py (resets *_test DB only)
  tests/               pytest suites (real Postgres)
frontend/
  src/api/             fetch client, typed endpoints, shared types
  src/auth/            AuthProvider, token storage, route guards
  src/layout/          AppShell (navy sidebar + header)
  src/features/        inventory/ (list, filters, drawer, purchase), admin/ (forms)
  src/components/      Button, fields, Drawer, Tabs, ConfirmDialog, Alert…
  src/test/            MSW fake API + render helpers
  e2e/                 Playwright specs (+ screenshot capture)
docs/                  TEST_REPORT.md, test-output/, screenshots/
```

## Getting started

### Prerequisites
- Python **3.12+** (developed on 3.14) · Node.js (developed on 26; CI is configured for 24) · PostgreSQL **17**

### 1. Database

**Option A: Homebrew (macOS, what I used)**
```sh
brew install postgresql@17
brew services start postgresql@17
PG=/opt/homebrew/opt/postgresql@17/bin
$PG/psql postgres -c "CREATE ROLE drivestock WITH LOGIN PASSWORD 'drivestock_dev';"
$PG/createdb -O drivestock drivestock
$PG/createdb -O drivestock drivestock_test
```

**Option B: Docker** (creates both databases with the same credentials; not tested on my machine, see the test report)
```sh
docker compose up -d
```

> `drivestock_dev` is a local-only development password. Use your own credentials anywhere else.

### 2. Backend
```sh
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
cp .env.example .env
# set JWT_SECRET to a long random value:
python3 -c "import secrets; print(secrets.token_urlsafe(48))"

.venv/bin/alembic upgrade head                 # run migrations
.venv/bin/python -m app.cli seed               # optional: 12 demo vehicles
.venv/bin/python -m app.cli create-admin --email admin@example.com --name "Store Admin"
                                               # prompts for a password (or set ADMIN_PASSWORD)
.venv/bin/uvicorn app.main:app --reload --port 8000
```
Interactive API docs: <http://localhost:8000/docs>

### 3. Frontend
```sh
cd frontend
npm install
cp .env.example .env        # VITE_API_URL=http://localhost:8000/api
npm run dev                 # http://localhost:5173
```

Register a customer from the sign-up page, or sign in with the admin you created.

### Configuration

| Variable | Where | Default / example | Purpose |
|---|---|---|---|
| `DATABASE_URL` | backend | `postgresql+psycopg://drivestock:…@localhost:5432/drivestock` | Main database |
| `TEST_DATABASE_URL` | backend | `…/drivestock_test` | pytest + e2e; **must end in `_test`** (a safety check) |
| `JWT_SECRET` | backend | *(required, ≥ 32 chars)* | Token signing key |
| `JWT_EXPIRE_MINUTES` | backend | `60` | Access token lifetime |
| `CORS_ORIGINS` | backend | `http://localhost:5173` | Comma-separated allowed origins |
| `VITE_API_URL` | frontend | `http://localhost:8000/api` | API base URL |

## Running the tests

```sh
# Backend: lint, types, tests (uses drivestock_test; migrates it down and up on every run)
cd backend
.venv/bin/ruff check . && .venv/bin/ruff format --check . && .venv/bin/mypy app
.venv/bin/pytest --cov=app

# Frontend: lint, types, unit/integration tests, build
cd frontend
npm run lint && npm run typecheck && npm test && npm run build
npm run test:coverage

# End-to-end against the real API + Postgres (resets drivestock_test, starts both servers)
npx playwright install chromium   # first time only
npm run test:e2e

# Regenerate README screenshots from the running app
npm run screenshots
```

## API documentation

Base URL `/api`. Every endpoint except register, login and health requires `Authorization: Bearer <token>`. FastAPI also serves OpenAPI docs at **`/docs`** (Swagger UI) and `/openapi.json`.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | none | Liveness check |
| POST | `/auth/register` | none | Create a **customer** account → `201 User` |
| POST | `/auth/login` | none | → `{access_token, token_type, user}` |
| GET | `/auth/me` | user | Current user |
| GET | `/vehicles` | user | List with filters, sort and paging → `VehicleList` |
| GET | `/vehicles/search` | user | Same parameters and response as `/vehicles` |
| GET | `/vehicles/{id}` | user | One vehicle |
| POST | `/vehicles` | **admin** | Create (with initial `quantity`) → `201` |
| PUT | `/vehicles/{id}` | **admin** | Replace details (`quantity` **not** allowed) |
| DELETE | `/vehicles/{id}` | **admin** | → `204` (purchase history is kept) |
| POST | `/vehicles/{id}/purchase` | user | `{quantity?: 1–10}` → `{purchase, vehicle}` |
| POST | `/vehicles/{id}/restock` | **admin** | `{quantity: 1–1000}` → `Vehicle` |

**Search/list query parameters:** `q` (free text over make/model/trim; every word must match), `make`, `model` (exact, case-insensitive), `category`, `min_price`, `max_price`, `availability` (`all` \| `in_stock` \| `out_of_stock`), `sort` (`newest` \| `price_asc` \| `price_desc` \| `year_desc` \| `year_asc` \| `make_asc`), `limit` (1–100, default 20), `offset`.

**Vehicle**
```json
{
  "id": 1, "make": "Ford", "model": "Kuga", "trim": "ST-Line", "year": 2024,
  "category": "suv", "fuel_type": "hybrid", "transmission": "automatic",
  "price": "35990.00", "quantity": 6
}
```
`category` ∈ sedan, suv, hatchback, coupe, convertible, truck, van, wagon · `fuel_type` ∈ petrol, diesel, hybrid, electric · `transmission` ∈ manual, automatic. Prices are **fixed-point strings** so they never pass through floats.

**VehicleList:** `{"items": [Vehicle], "total": 3, "counts": {"all": 5, "in_stock": 3, "out_of_stock": 2}}`. `counts` ignore the `availability` filter, so each option in the filter panel can show its own count.

**Errors** always look like this:
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed",
             "details": [ { "field": "price", "issue": "Input should be greater than 0" } ] } }
```

| Status | Codes |
|---|---|
| 401 | `NOT_AUTHENTICATED`, `INVALID_TOKEN`, `INVALID_CREDENTIALS` |
| 403 | `FORBIDDEN` (customer calling an admin endpoint) |
| 404 | `VEHICLE_NOT_FOUND`, `NOT_FOUND` |
| 409 | `EMAIL_TAKEN`, `OUT_OF_STOCK`, `INSUFFICIENT_STOCK`, `STOCK_LIMIT_EXCEEDED` |
| 422 | `VALIDATION_ERROR` (body, query or path) |
| 500 | `INTERNAL_ERROR` (no internals exposed) |

Example:
```sh
TOKEN=$(curl -s -X POST localhost:8000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"…"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
curl -s "localhost:8000/api/vehicles/search?category=suv&availability=in_stock&sort=price_asc" \
  -H "Authorization: Bearer $TOKEN"
curl -s -X POST localhost:8000/api/vehicles/1/purchase -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"quantity":1}'
```

## Data model

| Table | Columns | Constraints |
|---|---|---|
| `users` | id, email, password_hash, full_name, role (`customer`\|`admin`), created_at | unique lowercase email |
| `vehicles` | id, make, model, trim?, year, category, fuel_type, transmission, price `NUMERIC(12,2)`, quantity, created_at, updated_at | `price > 0`, `quantity >= 0`, `year 1900–2100`; indexes on (make, model), category, price |
| `purchases` | id, user_id → users, vehicle_id → vehicles **ON DELETE SET NULL**, vehicle_label, quantity, unit_price, created_at | `quantity > 0`, `unit_price > 0` |

Migrations live in `backend/alembic/versions`. Apply them with `alembic upgrade head`, roll back with `alembic downgrade -1`.

## Design decisions and trade-offs

- **Assumptions.** The written kata wasn't available while building, so routes, fields and rules follow the requirements as briefed (auth, roles, vehicle CRUD, search, purchase, restock) and the usual layout of Incubyte's kata. Notable choices: *every* vehicle endpoint requires sign-in; creating vehicles is admin-only; registration always creates a customer.
- **Overselling is impossible by construction.** A purchase is one statement, `UPDATE vehicles SET quantity = quantity - :n WHERE id = :id AND quantity >= :n RETURNING *`, and the purchase row is inserted in the same transaction. Zero rows updated means 404 or 409. No read-then-write race is possible. The database `CHECK (quantity >= 0)` backs it up.
- **Stock changes only through purchase and restock.** `PUT` rejects `quantity`, so an admin edit can't silently overwrite concurrent sales.
- **Purchase history survives deletion.** `purchases.vehicle_id` becomes `NULL` and a `vehicle_label` snapshot is kept.
- **Admins via CLI.** Self-service admin sign-up would be a privilege-escalation path.
- **Filters in the URL.** Shareable, reload-safe views. They're React state mirrored to the URL so form controls update immediately (see defect #3 in the test report).
- **No vehicle images.** Out of scope by decision. Category icons serve as neutral placeholders.
- **Simplicity over extras.** No Redux, no UI kit, no ORM repositories, no global state beyond the auth context and the query cache.

## Security notes

- argon2 password hashing; passwords 8–128 characters; generic login errors with equal-cost verification.
- Roles enforced on the server (`require_admin`). The UI only hides controls.
- JWT secret required and at least 32 characters; tokens expire after 60 minutes.
- **Token storage:** the SPA keeps the token in `localStorage` so sessions survive reloads. Any script on the page can read it if XSS were possible. Mitigations: React escaping, no `dangerouslySetInnerHTML`, no third-party scripts, short expiry. An httpOnly cookie with CSRF protection would be the next step for production.
- Out-of-range IDs and offsets → 422; unexpected errors → generic 500 (details only in server logs).
- Not implemented: login rate limiting, token revocation or refresh, security headers (expected from a reverse proxy).

## Screenshots

All captured by `npm run screenshots` (Playwright) from the running app with the real API and database.

| | |
|---|---|
| ![Sign in](docs/screenshots/01-sign-in.png) **Sign in** | ![Register validation](docs/screenshots/02-register-validation.png) **Registration validation** |
| ![Inventory](docs/screenshots/03-customer-inventory.png) **Customer inventory** | ![Filters](docs/screenshots/04-filters.png) **Category + availability filters** |
| ![Purchase](docs/screenshots/05-details-and-purchase.png) **Details drawer + purchase** | ![Admin inventory](docs/screenshots/06-admin-inventory.png) **Admin inventory** |
| ![Add vehicle](docs/screenshots/07-admin-add-vehicle.png) **Add vehicle** | ![Restock](docs/screenshots/08-admin-restock.png) **Restock** |
| ![Edit](docs/screenshots/09-admin-edit.png) **Edit** | ![Delete](docs/screenshots/10-admin-delete-confirm.png) **Delete confirmation** |
| ![Tablet](docs/screenshots/11-tablet.png) **Tablet** | ![Mobile](docs/screenshots/12-mobile.png) **Mobile** |

## Test report

See **[docs/TEST_REPORT.md](docs/TEST_REPORT.md)**. In short: **97 backend tests (98 % coverage), 49 frontend tests (93 % statement coverage), 4 Playwright end-to-end tests**, all passing, plus lint and type checks. Raw console output is in `docs/test-output/`. It also lists what has **not** been verified (CI never run, docker-compose untested, Python 3.14 and Chromium only).

The git history follows red → green → refactor: `test(...): … (red)` commits hold failing tests, followed by `feat(...)/fix(...): … (green)` commits that make them pass. Where a test and its implementation landed in one commit, the commit message says so.

## My AI Usage

**Tool:** [Claude Code](https://claude.com/claude-code) (Anthropic's CLI agent), model **Claude Opus 5.5**, used in a single session in this repository. The full conversation (every prompt and reply, verbatim) is in **[PROMPTS.md](PROMPTS.md)**, exported from the session transcript with `scripts/export_prompts.py`.

**How I used it**
- **Planning:** I gave Claude the assignment brief, my engineering and TDD rules, and a Dribbble reference (as screenshots, since it couldn't open the page itself). It proposed the stack, schema, API contract and phased plan; I approved it and made the key decisions: PostgreSQL 17 over SQLite, keeping the reference screenshots out of git, category icons instead of image uploads, and letting it choose the product name.
- **Implementation:** Claude wrote the code and tests phase by phase in a red → green → refactor loop. It ran each failing test before implementing and committed the red and green steps separately. Every commit it authored carries a `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` trailer.
- **System changes stayed with me:** Claude listed the exact commands, and I ran the Homebrew PostgreSQL install, service start and database or role creation myself.
- **Verification:** Claude ran the suites, smoke-tested the live API with curl, reviewed real Playwright screenshots of the UI at three screen sizes, and did a security and edge-case pass. That pass found and fixed four real defects (listed in the test report).

**Where AI output needed correcting**
- Several tests initially failed for the wrong reason (a fixture collision, two "404" tests passing only because the route didn't exist yet, selectors matching two elements). These were fixed in the tests and noted in the commit messages.
- A unit test intended to catch the filter-control bug turned out not to reproduce it under jsdom. It was removed rather than kept as false assurance; the Playwright test is the real guard.

**Reflection** *(to be written by me)*
> _TODO (Prajot): add a few sentences in your own words: what AI sped up, where you had to step in, and what you would do differently._

## Credits

UI direction inspired by **"Car inventory – Easy and detailed stock overview"** by **Drilon Spahiu** on Dribbble: <https://dribbble.com/shots/25951043-Car-inventory-Easy-and-detailed-stock-overview>. The layout ideas (navy sidebar, filter panel, dense inventory rows, right-hand details drawer) were adapted. No assets, branding or code were copied, and the reference screenshots aren't included in this repository.
