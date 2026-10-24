# DriveStock — Car Dealership Inventory System

A full-stack inventory system for a car dealership. Customers browse, search and buy vehicles; admins manage listings, prices and stock. Built test-first with a FastAPI + PostgreSQL REST API and a React + TypeScript + Tailwind single-page app.

![DriveStock landing page](docs/screenshots/15-landing.png)

---

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Accounts & Roles](#accounts--roles)
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

**Public website** (no sign-in needed)
- Landing page at `/` explaining the product, with a coded dashboard preview (clearly labelled sample data), features, how it works, and **Get Started** / **Sign In** calls to action
- **About** (`/about`): mission, purpose and audience. **Pricing** (`/pricing`): three plans, all clearly marked as placeholders; no billing or payments exist
- Responsive navbar (Home, Features, About, Pricing, Sign In, Get Started) with a mobile menu; signed-in visitors see **Open dashboard** instead
- Separate **Sign In** (`/login`) and **Sign Up** (`/signup`) pages; after either, users land in the app at `/app`, or back on the app URL they originally asked for

**Everyone (signed in, at `/app`)**
- Register and sign in (JWT bearer tokens); the session survives a reload
- Inventory list showing each vehicle's cover photo, make, model, trim, year, spec line, price and a live stock badge (in stock / low stock / out of stock). Vehicles without photos show a drawing of their body style
- Search (make, model, trim) and filters for category, price range and availability, with counts per availability state; filters live in the URL so a view can be shared
- Sorting (newest, price, year, make) and pagination
- Details drawer with a photo gallery, full specifications and **purchase** (quantity stepper capped at available stock, purchase disabled at zero stock)

**Admins** (server-enforced)
- Add vehicles (with initial stock), edit details and price, **restock**, delete (with confirmation)
- **Upload vehicle photos** from their device: several at once when adding a vehicle, then add or remove photos in the Edit tab (up to 10 per vehicle, JPEG/PNG/WebP, 5 MB each). The first photo is the cover
- Prospective dealers **register as a dealer**; they get admin rights only after an existing admin **approves** the application. The first admin is created with a CLI command. See [Accounts & Roles](#accounts--roles)

**Guarantees**
- No overselling and no negative stock, even with concurrent buyers (atomic conditional `UPDATE` plus a database `CHECK`)
- Consistent JSON error format with field-level validation details
- Responsive layout: desktop, tablet (icon-rail sidebar), mobile (stacked cards, full-screen details sheet)
- Light and dark mode toggle (in the header and on the sign-in pages); follows the system setting until you choose, then remembers your choice

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
  src/marketing/       public site: MarketingLayout (navbar/footer), Home, About, Pricing
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

The public site is at <http://localhost:5173/> and the app at <http://localhost:5173/app>. Create a customer account via **Get Started**, or sign in with the admin you created.

### Configuration

| Variable | Where | Default / example | Purpose |
|---|---|---|---|
| `DATABASE_URL` | backend | `postgresql+psycopg://drivestock:…@localhost:5432/drivestock` | Main database |
| `TEST_DATABASE_URL` | backend | `…/drivestock_test` | pytest + e2e; **must end in `_test`** (a safety check) |
| `JWT_SECRET` | backend | *(required, ≥ 32 chars)* | Token signing key |
| `JWT_EXPIRE_MINUTES` | backend | `60` | Access token lifetime |
| `CORS_ORIGINS` | backend | `http://localhost:5173` | Comma-separated allowed origins |
| `MEDIA_DIR` | backend | `backend/media` | Where uploaded photos are stored (git-ignored; **back it up with the database**). Tests and e2e use temporary folders |
| `APP_ENV` | backend | `production` (`.env.example` sets `development`) | Only `development` allows `seed-demo-users`. Anything else, or unset, is treated as production |
| `VITE_API_URL` | frontend | `http://localhost:8000/api` | API base URL |

## Accounts & Roles

DriveStock has two roles. The role is stored on the account and **checked by the API on every request**. The interface only hides controls a role can't use.

| | **Customer** | **Admin** (dealer staff) |
|---|---|---|
| Browse, search, filter, view details | ✅ | ✅ |
| Purchase vehicles | ✅ | ✅ |
| Add, edit, restock, delete vehicles | — | ✅ |
| Review dealer applications | — | ✅ |
| How the account is created | **Sign Up** (`/signup`) | Approved **dealer application**, or the `create-admin` CLI command (first admin) |

**Signing in.** Everyone uses the same secure page, `/login`. It has a **Customer / Dealer Sign In** switch (`/login?as=dealer` opens the dealer side). The switch only changes the wording and links; what you can do afterwards depends on the account's role. After signing in, everyone lands on `/app`. Admins see an **Admin** badge, an **Add vehicle** button, **Edit / Restock** tabs and a delete action in each vehicle's panel, plus **Dealer applications** in the sidebar.

**Dealer registration and approval**
1. A prospective dealer opens **Register as a Dealer** (`/dealer/register`, linked from Dealer Sign In, the sign-up page and the footer). They submit name, email, password, dealership name, and optionally a phone number and message.
2. This creates a **customer** account and a **pending** application in one transaction. Public registration can never grant admin, even if a `role` field is sent. The applicant is signed in and sees a banner saying the application is pending, with customer access only.
3. An admin opens **Dealer applications** (`/app/dealer-applications`, admin-only; customers are redirected away and the API returns 403) and clicks **Approve** or **Reject**, adding an optional note when rejecting.
4. **Approve** changes the account's role to `admin` and records who approved it and when. The API grants the new rights straight away (it reads the role from the database on every request), and an applicant who is signed in sees the inventory tools within a minute, or as soon as they return to the tab, without signing out. **Reject** keeps customer access, and the applicant sees the note. An application can be reviewed only once: the decision is a single conditional update, so two admins acting at once can't both succeed.

**Creating the first admin** (needed once, on any new database):
```sh
cd backend && .venv/bin/python -m app.cli create-admin --email you@example.com --name "Your Name"
```

### Testing both roles locally

The quickest way is the **demo accounts** command. It creates a demo admin, a demo customer and a demo dealer applicant with a **pending** application, so you can try the approval flow.
```sh
cd backend
.venv/bin/python -m app.cli seed               # demo vehicles, if not already loaded
.venv/bin/python -m app.cli seed-demo-users    # prints the accounts below
```

| Role | Email | Password |
|---|---|---|
| Admin | `demo-admin@example.com` | `demo-admin-pass` |
| Customer | `demo-customer@example.com` | `demo-customer-pass` |
| Dealer applicant (pending) | `demo-dealer@example.com` | `demo-dealer-pass` |

These passwords are public on purpose and for **local development only**. The command refuses to run unless `APP_ENV=development` **and** the database host is `localhost`. `APP_ENV` defaults to `production`, so a server without that setting can't create them. It's idempotent: running it again doesn't create duplicates.

1. **Customer:** go to <http://localhost:5173/login>, sign in as the demo customer, then browse and purchase. You'll see no admin controls.
2. **Dealer applicant:** sign out and choose **Dealer Sign In** as the demo dealer. You'll see the "application pending" banner and customer access only.
3. **Admin:** sign out and sign in as the demo admin. Open **Dealer applications** (sidebar, with a pending count) and approve *Demo Motors*. Try **Add vehicle**, or **View details** then **Edit / Restock** and the trash icon.
4. **Approved dealer:** sign out and sign in as the demo dealer again. The banner is gone and the inventory tools are available.

## Running the tests

### Test stack

| Level | Tools | What it covers |
|---|---|---|
| **Backend** | **pytest**, FastAPI **TestClient** (`httpx2`), **pytest-cov** | 164 tests against a **real PostgreSQL 17** test database (`drivestock_test`), not mocks. Each run migrates it down and back up, and tables are emptied after every test. Includes a 20-thread concurrency test showing stock can't be oversold. |
| **Frontend** | **Vitest**, **React Testing Library** + **user-event**, **jsdom**, **MSW** (Mock Service Worker), **@vitest/coverage-v8** | 108 component and integration tests that act as a user would (by role and label), against an in-memory fake of the API that mirrors its status codes and error format. |
| **End-to-end** | **Playwright** (Chromium) | Real browser against the real API and Postgres: customer purchase, admin add/edit/restock/delete, out-of-stock handling, a server-side 403 check, the public-site journey (landing → pricing → sign-up → `/app`), dealer onboarding (apply → admin approves → dealer gets inventory tools), and photo upload (add with a new vehicle, add and remove in Edit, still there after a reload, non-images rejected). Also captures the README screenshots. |
| **Static checks** | **ruff** (lint + formatting), **mypy `--strict`**, **oxlint**, **`tsc --noEmit`** | Lint and type checks for both apps. |
| **CI** | **GitHub Actions** | Runs the backend (with a Postgres 17 service) and frontend jobs on every push. Playwright currently runs locally only. |

### Commands

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
| POST | `/vehicles/{id}/photos` | **admin** | `multipart/form-data` with one or more `files` (JPEG, PNG or WebP, ≤ 5 MB each, ≤ 10 per vehicle) → `201 Vehicle`. All or nothing: one bad file rejects the upload |
| DELETE | `/vehicles/{id}/photos/{photo_id}` | **admin** | → `204`; the files are deleted too |
| GET | `/media/vehicles/{key}.webp` | none | Photo files (full size and `-thumb`), served as static files |
| POST | `/auth/register-dealer` | none | `{full_name, email, password, business_name, phone?, message?}` → `201 {user, application}`. The account is a **customer**; the application is `pending` |
| GET | `/dealer-applications/me` | user | Your own application, or `404 APPLICATION_NOT_FOUND` |
| GET | `/dealer-applications` | **admin** | `?status=pending\|approved\|rejected` → `[Application]` |
| POST | `/dealer-applications/{id}/approve` | **admin** | Pending only (409 `APPLICATION_NOT_PENDING` otherwise); sets the applicant's role to `admin` |
| POST | `/dealer-applications/{id}/reject` | **admin** | `{note?}`; pending only; the account stays a customer |

**Search/list query parameters:** `q` (free text over make/model/trim; every word must match), `make`, `model` (exact, case-insensitive), `category`, `min_price`, `max_price`, `availability` (`all` \| `in_stock` \| `out_of_stock`), `sort` (`newest` \| `price_asc` \| `price_desc` \| `year_desc` \| `year_asc` \| `make_asc`), `limit` (1–100, default 20), `offset`.

**Vehicle**
```json
{
  "id": 1, "make": "Ford", "model": "Kuga", "trim": "ST-Line", "year": 2024,
  "category": "suv", "fuel_type": "hybrid", "transmission": "automatic",
  "price": "35990.00", "quantity": 6,
  "photos": [{ "id": 3, "url": "/api/media/vehicles/9f…c1.webp", "thumb_url": "/api/media/vehicles/9f…c1-thumb.webp" }]
}
```
`category` ∈ sedan, suv, hatchback, coupe, convertible, truck, van, wagon · `fuel_type` ∈ petrol, diesel, hybrid, electric · `transmission` ∈ manual, automatic. Prices are **fixed-point strings** so they never pass through floats. `photos` is read-only and in display order (the first is the cover); photo URLs are paths on the API host.

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
| 404 | `VEHICLE_NOT_FOUND`, `PHOTO_NOT_FOUND`, `NOT_FOUND` |
| 409 | `EMAIL_TAKEN`, `OUT_OF_STOCK`, `INSUFFICIENT_STOCK`, `STOCK_LIMIT_EXCEEDED`, `PHOTO_LIMIT_EXCEEDED` |
| 413 | `PHOTO_TOO_LARGE` (over 5 MB, or over 40 megapixels) |
| 415 | `UNSUPPORTED_PHOTO_TYPE` (judged by the file's contents, not its name or declared type) |
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
| `vehicles` | id, make, model, trim?, year, category, fuel_type, transmission, price `NUMERIC(12,2)`, quantity, catalog_image_id? *(unused, see below)*, created_at, updated_at | `price > 0`, `quantity >= 0`, `year 1900–2100`; indexes on (make, model), category, price |
| `vehicle_photos` | id, vehicle_id → vehicles **ON DELETE CASCADE**, file_key, position, created_at | `file_key` unique, 32 hex characters; `position >= 0`; index on vehicle_id |
| `purchases` | id, user_id → users, vehicle_id → vehicles **ON DELETE SET NULL**, vehicle_label, quantity, unit_price, created_at | `quantity > 0`, `unit_price > 0` |
| `dealer_applications` | id, user_id → users (unique), business_name, phone?, message?, status (`pending`\|`approved`\|`rejected`), created_at, reviewed_at?, reviewed_by_id → users, review_note? | one application per account; index on status |

`vehicles.catalog_image_id` (migration `0005`) is unused. It's left over from a removed CarDatabase.dev photo integration and kept to avoid a destructive migration. It's nullable, not exposed by the API, and left untouched by edits.

Migrations live in `backend/alembic/versions`. Apply them with `alembic upgrade head`, roll back with `alembic downgrade -1`.

## Design decisions and trade-offs

- **Assumptions.** The written kata wasn't available while building, so routes, fields and rules follow the requirements as briefed (auth, roles, vehicle CRUD, search, purchase, restock) and the usual layout of Incubyte's kata. Notable choices: *every* vehicle endpoint requires sign-in; creating vehicles is admin-only; registration always creates a customer.
- **Overselling is impossible by construction.** A purchase is one statement, `UPDATE vehicles SET quantity = quantity - :n WHERE id = :id AND quantity >= :n RETURNING *`, and the purchase row is inserted in the same transaction. Zero rows updated means 404 or 409. No read-then-write race is possible. The database `CHECK (quantity >= 0)` backs it up.
- **Stock changes only through purchase and restock.** `PUT` rejects `quantity`, so an admin edit can't silently overwrite concurrent sales.
- **Purchase history survives deletion.** `purchases.vehicle_id` becomes `NULL` and a `vehicle_label` snapshot is kept.
- **Admins via CLI.** Self-service admin sign-up would be a privilege-escalation path.
- **Filters in the URL.** Shareable, reload-safe views. They're React state mirrored to the URL so form controls update immediately (see defect #3 in the test report).
- **Public site and app share one SPA.** Marketing pages (`/`, `/about`, `/pricing`) and the app (`/app`) live in the same React build with separate layouts; `/register` redirects to `/signup`. The pricing page is deliberately a labelled placeholder: there is no billing.
- **Single dealership today.** The backend serves one dealership. [`docs/MULTI_TENANCY.md`](docs/MULTI_TENANCY.md) explains why it can't yet host several safely and the recommended `dealership_id` plus row-level-security design. It's a plan, not implemented.
- **Photos on local disk.** Admins upload their own photos. Each upload is decoded with Pillow (so the file's contents decide whether it's accepted), rotated upright from the phone's orientation tag, then re-encoded as WebP at most 1600 px plus a 400 px thumbnail. Re-encoding drops all metadata, including GPS location. Files are named by random keys, and only `app/media.py` knows the folder layout, so moving to object storage (S3 and similar) means changing that one module. Photos are matched to the vehicle, not the model, because they show the dealer's actual car.
- **Simplicity over extras.** No Redux, no UI kit, no ORM repositories, no global state beyond the auth context and the query cache.

## Security notes

- argon2 password hashing; passwords 8–128 characters; generic login errors with equal-cost verification.
- Roles enforced on the server (`require_admin`). The UI only hides controls.
- JWT secret required and at least 32 characters; tokens expire after 60 minutes.
- **Token storage:** the SPA keeps the token in `localStorage` so sessions survive reloads. Any script on the page can read it if XSS were possible. Mitigations: React escaping, no `dangerouslySetInnerHTML`, no third-party scripts, short expiry. An httpOnly cookie with CSRF protection would be the next step for production.
- Out-of-range IDs and offsets → 422; unexpected errors → generic 500 (details only in server logs).
- **Uploaded photos:** admin-only; checked by decoding, not by file name or declared type; size, pixel-count and per-vehicle limits; metadata (including GPS) stripped; stored under random 128-bit names. Photo files are served without sign-in because `<img>` tags can't send a bearer token, so anyone with a photo's URL can view it. URLs are only listed by the signed-in API. There's no overall request-size limit in the app itself; set one at the reverse proxy (e.g. nginx `client_max_body_size 60m`).
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
| ![Dark mode](docs/screenshots/14-dark-mode.png) **Dark mode** | ![Landing mobile menu](docs/screenshots/18-landing-mobile-menu.png) **Landing page, mobile menu** |
| ![Landing](docs/screenshots/15-landing.png) **Landing page** | ![Pricing](docs/screenshots/17-pricing.png) **Pricing (placeholder)** |
| ![About](docs/screenshots/16-about.png) **About** | ![Dealer sign in](docs/screenshots/19-dealer-sign-in.png) **Dealer Sign In** |
| ![Dealer registration](docs/screenshots/20-dealer-register.png) **Register as a Dealer** | ![Pending banner](docs/screenshots/21-dealer-pending.png) **Applicant: pending banner** |
| ![Dealer applications](docs/screenshots/22-admin-dealer-applications.png) **Admin: dealer applications** | |

## Test report

See **[docs/TEST_REPORT.md](docs/TEST_REPORT.md)**. In short: **164 backend tests (98 % coverage), 108 frontend tests (94 % statement coverage), 12 Playwright end-to-end tests**, all passing, plus lint and type checks. Raw console output is in `docs/test-output/`. CI (GitHub Actions) passes on `main`. The report also lists what has **not** been verified (docker-compose untested, Python 3.14 and Chromium only, e2e run locally only).

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
