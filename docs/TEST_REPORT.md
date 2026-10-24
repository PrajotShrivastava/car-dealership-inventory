# Test Report

**Date:** 2026-10-24 · **Machine:** macOS (Apple Silicon), Python 3.14.6, Node 26.0.0, PostgreSQL 17.11 (Homebrew)

Every number below is copied from real runs. The full, unedited console output is saved in
[`docs/test-output/`](test-output/):

| File | Command(s) |
|---|---|
| [`backend.txt`](test-output/backend.txt) | `ruff check`, `ruff format --check`, `mypy app`, `pytest -v --cov=app` |
| [`frontend.txt`](test-output/frontend.txt) | `npm run lint`, `npm run typecheck`, `vitest run --coverage`, `npm run build` |
| [`e2e.txt`](test-output/e2e.txt) | `npx playwright test` |

## Summary

| Suite | Result | Coverage |
|---|---|---|
| Backend (pytest, real PostgreSQL `drivestock_test`) | **170 passed**, 0 failed (≈17 s) | **98 %** statements (798 stmts, 17 missed) |
| Frontend (Vitest + React Testing Library + MSW) | **109 passed**, 0 failed | **94.3 %** stmts · 87.3 % branches · 93.5 % funcs · 94.9 % lines |
| End-to-end (Playwright, Chromium, real API + PostgreSQL) | **12 passed**, 7 skipped¹ | n/a |
| Static checks | ruff ✔ · ruff format ✔ · mypy `--strict` ✔ · oxlint 0 warnings · `tsc --noEmit` ✔ · production build ✔ | |

¹ The 7 skipped tests are `e2e/screenshots.spec.ts`. They only run with `SCREENSHOTS=1` (`npm run screenshots`) and capture the README images.

## Backend tests by file

| File | Tests | What it covers |
|---|---|---|
| `test_auth.py` | 11 | register (lowercased email, argon2 hash, role can't be self-assigned, duplicate → 409, field-level 422), login (token, identical generic 401 for wrong password vs unknown email), `/me` (missing, tampered and expired tokens → 401) |
| `test_vehicles_crud.py` | 29 | 401 on every endpoint without a token, 403 for customer create/update/delete, create/read/update/delete, trimming, 11 invalid-field cases, empty inventory, 404s, `quantity` rejected on PUT |
| `test_vehicles_search.py` | 22 | free-text search over make/model/trim (multi-word, LIKE wildcards treated literally), make/model/category/price range/availability filters, combined filters, faceted counts, sorting, paging, 8 invalid-query cases |
| `test_inventory_actions.py` | 20 | purchase (default 1, multiple units, price snapshot, totals), out-of-stock and insufficient-stock 409s with no side effects, 404, invalid quantities, **concurrency**, restock (admin-only, 401/403/404/422), deleting a sold vehicle keeps purchase history |
| `test_hardening.py` | 8 | JSON 500 with no internals, out-of-range IDs → 422 on all 5 ID routes, offset cap, 100,000-unit stock ceiling |
| `test_dealer_role.py` | 16 | dealer sign-up creates a **dealer** directly (no application; a `role` field is ignored), stored and returned on sign-in; duplicate email and validation; customer sign-up still creates a customer (403 on inventory changes); a new dealer creates, edits, restocks and deletes a vehicle and uploads and deletes a photo straight away; dealers share one inventory; dealers get 403 on all application-review endpoints; admins keep the inventory tools |
| `test_dealer_applications.py` | 15 | applications that already exist (inserted directly, as new sign-ups no longer create them): a pending applicant has no inventory rights; `/me`; admin-only list, approve and reject (401/403 for others); approval makes the applicant a **dealer** immediately with the same token, records the reviewer, and doesn't grant application review; rejection keeps customer access and stores the note; each application reviewed once (409); 404 and 422; **10 concurrent approvals → exactly 1 succeeds** |
| `test_demo_users.py` | 7 | `APP_ENV` defaults to production; demo seeding refused outside development and for a non-localhost database; creates an admin, a customer and a dealer once (idempotent); CLI exit code and printed credentials |
| `test_cli.py` | 6 | `create-admin` (hashing, duplicate, validation, environment password), `seed` (runs once only, includes out-of-stock cars) |
| `test_health.py` | 1 | health check |
| `test_vehicle_photos.py` | 31 | admin uploads several photos at once; photos appear on detail, search, edit, restock and purchase responses in upload order; JPEG/PNG/WebP accepted and served as WebP; resized to ≤ 1600 px plus a 400 px thumbnail, never enlarged; **EXIF and GPS removed**; phone rotation applied; transparency kept; 401/403/404/422; non-images, GIFs and a GIF renamed `.jpg` → 415; > 5 MB and a 144-megapixel "decompression bomb" → 413; one bad file rejects the whole upload with no files left behind; 10-photo limit (409); delete one photo (files removed), admin-only, must belong to the vehicle; deleting a vehicle deletes its photo files |
| `test_unused_columns.py` | 4 | the unused `catalog_image_id` column is not in API responses, stays null for new vehicles, is left untouched by edits, and can't be set through the API (422) |

**Migrations:** each pytest session runs `alembic downgrade base` then `alembic upgrade head` on the test database, so every migration's upgrade *and* downgrade runs on every test run. `alembic check` against the dev database reports *"No new upgrade operations detected"*, meaning the models and migrations match.

## Overselling and concurrency

- `test_concurrent_purchases_never_oversell`: 20 threads, released together by a barrier, each try to buy 1 unit of a vehicle with 5 in stock. Expected and observed: **exactly 5 succeed, stock ends at 0, 5 purchase rows**. I ran it 11 extra times on its own (8 + 3) and it passed every time.
- **Mutation check** (a one-off script, not committed): replacing the atomic `UPDATE … WHERE quantity >= n` with a naive read-then-write gave *"20 'successful' purchases for 5 units in stock; final quantity=3"*. The test scenario does catch the race the implementation prevents.
- Defence in depth: `CHECK (quantity >= 0)` in the database.

## Frontend tests by file

| File | Tests | What it covers |
|---|---|---|
| `api/client.test.ts` | 5 | bearer token, JSON body, ApiError with field errors, 204 handling, global 401 → sign-out, network errors |
| `auth/auth.test.tsx` | 11 | redirect to sign-in, sign in, wrong credentials, client-side validation, register, duplicate email, session restore, stale token, signed-in users kept off `/login`, sign out |
| `features/inventory/InventoryPage.test.tsx` | 16 | list, empty inventory, load error and retry, search, category, availability counts, price range, clear filters, sort, paging, details drawer (Escape), purchase updates stock, quantity capped at stock, out-of-stock disabled, server rejection shown, body-style placeholder when there's no photo |
| `features/inventory/format.test.ts` | 9 | price formatting, stock thresholds, labels |
| `features/admin/admin.test.tsx` | 9 | customers see no admin controls; admin add (with client-side and API field errors), edit, restock (valid and invalid amounts), delete with confirm and cancel |
| `features/dealers/dealers.test.tsx` | 17 | Dealer Sign In switch (and `?as=dealer`), customer sign-up kept separate, a dealer signs in to the inventory tools; dealer registration asks only for name, email and password, creates a dealer with **Add vehicle**, the dealer badge and no banner or admin page, validation, duplicate email; older applications: rejected banner shows the note, an applicant approved while signed in becomes a dealer without signing out; admin sidebar item with pending count; dealers and customers redirected away from the review page (dealers keep Edit, Restock and delete); approve and reject (with note) through the confirmation dialog; empty state |
| `routing.test.tsx` | 9 | public `/`, app behind sign-in at `/app`, `/register` → `/signup`, redirects to `/app` after sign-in and sign-up, deep `/app?…` link preserved, signed-in users can browse public pages, 404 |
| `marketing/marketing.test.tsx` | 12 | navbar links and navigation, mobile menu, "Open dashboard" when signed in, hero calls to action, marquee headline announced once (animated copies hidden from assistive tech), pause and resume of the headline animation, dashboard preview labelled sample data, features section, about content, pricing plans marked placeholder with buttons going to sign-up |
| `features/inventory/photos.test.tsx` | 16 | cover thumbnail in the list (lazy, absolute API URL); body-style drawing when there are no photos or one fails to load; drawer gallery with thumbnail buttons; no photo controls for customers; choosing photos when adding a vehicle (previews, remove before saving, type/size/count checks); a failed upload after creating the vehicle opens it in Edit with a message instead of creating a duplicate; Edit tab lists, adds and removes photos (with confirmation and cancel), shows API errors, disables uploads at 10 |
| `theme/theme.test.tsx` | 5 | light/dark toggle in the header and on sign-in, saved choice persisted and restored, system setting used when nothing is saved |

Unit tests use an in-memory MSW fake of the API contract (`src/test/handlers.ts`). The Playwright suite then checks the same flows against the real API and database.

## End-to-end (real stack)

Playwright starts the API on :8001 against the `drivestock_test` database, reset by `backend/scripts/prepare_e2e_db.py`, which refuses any database not named `*_test`, plus Vite on :5174.

1. A customer registers, searches "kuga", buys 2 units, and sees stock drop from 6 to 4. **It's still 4 after a full page reload**, so the purchase is persisted.
2. An out-of-stock vehicle's purchase button is disabled.
3. An admin adds a vehicle with 0 stock, edits its price, restocks 3 units, then deletes it.
4. Direct API calls with a customer token to `restock` and `DELETE` return **403**, so permissions are enforced on the server, not just hidden in the UI.
5. A visitor goes from the landing page to Pricing, then Get Started, signs up and lands on `/app`; public pages stay reachable while signed in, with **Open dashboard** leading back.
6. The navbar's **Features** link scrolls to the features section.
7. A deep link (`/app?category=suv`) survives the sign-in detour, query included.
8. **Dealer sign-up:** a new dealer registers through Dealer Sign In and immediately has **Add vehicle**, the dealer badge and no pending banner; adds a vehicle with a photo, edits its price and deletes it. The API returns role `dealer`, allows an inventory change (restock with quantity 0 → 422, never 403, so no data changes) and refuses the application list (403); the review page redirects to `/app`.
9. Customer sign-up still creates a customer: no inventory tools, and the API returns role `customer`.
10. A customer opening `/app/dealer-applications` is redirected to `/app`.
11. **Photos:** an admin adds a vehicle with two photos, sees the cover in the list and the gallery in the drawer (the browser actually decodes the images), adds a third and removes one in the Edit tab, and the photos are still there after a reload. The vehicle is then deleted. Uploads go to a temporary folder, not `backend/media`.
12. A file that isn't an image, sent as `car.jpg` with type `image/jpeg`, is rejected by the API with 415.

## Security review

| Check | Result |
|---|---|
| Password storage | argon2id (argon2-cffi defaults); maximum length 128 to avoid hashing-cost abuse |
| Login enumeration and timing | unknown emails are verified against a dummy hash; identical 401 body for both failures |
| Authorisation | `require_admin` dependency on create/update/delete/restock; role read from the DB on every request |
| Mass assignment | `role` ignored on register; `quantity` rejected on PUT (`extra="forbid"`) |
| Injection | SQLAlchemy bound parameters only; LIKE wildcards escaped |
| Secrets | `.env` git-ignored and not tracked (`git ls-files`); the real JWT secret appears **0 times** in `git log -p --all`; `JWT_SECRET` must be ≥ 32 characters or the app won't start |
| Error leakage | unhandled exceptions → `{"error":{"code":"INTERNAL_ERROR"}}`; details only in the server log |
| Dependencies | `pip-audit -r requirements.txt`: *No known vulnerabilities found* · `npm audit`: *found 0 vulnerabilities* |
| Frontend | no `dangerouslySetInnerHTML` or `eval`; token stored in `localStorage` (trade-off documented in the README) |

### Defects found during QA (all fixed, each with a test)

1. **`/api/vehicles/2147483648` returned 500** (`NumericValueOutOfRange`). IDs are now validated to the Postgres INTEGER range, so the response is 422.
2. **Unbounded restock** could overflow the integer column. There's now a 100,000-unit ceiling enforced in the same atomic UPDATE (409 `STOCK_LIMIT_EXCEEDED`).
3. **Filter radio briefly snapped back in the browser.** It read the URL, which React Router updates asynchronously. Filters are now React state mirrored to the URL. The Playwright suite caught it; the jsdom unit tests could not reproduce it.
4. Found by reviewing screenshots: at tablet width vehicle names were cut off and badges overlapped prices. Fixed with an icon-rail sidebar and fixed column widths.
5. **The confirmation dialog stole focus while typing.** It (and the side drawer) re-ran its focus effect on every re-render, moving focus to Cancel, so a space keypress in the rejection-note field cancelled the dialog. Found by the reject-with-note test. Focus now moves only when the dialog opens.

## Not verified / known gaps

- **Test order.** The e2e tests for direct dealer sign-up were written after the code change, so unlike the unit tests they were never seen failing first.
- **Photo uploads in unit tests.** jsdom's `FormData`/`File` can't be sent through Node's `fetch`, so `src/test/setup.ts` rebuilds upload bodies with Node's classes, and the MSW fake reads the multipart body as text. Real multipart parsing is covered by the backend tests and the Playwright run. Not covered by any test: cleaning up already-written files if the database write fails mid-upload (`services/photos.py` lines 100–103).
- **Request size.** The app limits each photo to 5 MB but has no overall request-size limit. That's expected from a reverse proxy, which isn't part of this project.
- **CI workflow** (`.github/workflows/ci.yml`): first GitHub Actions run after pushing, [run 40064767293](https://github.com/PrajotShrivastava/car-dealership-inventory/actions/runs/40064767293), **passed**: backend job (ruff, mypy, pytest with coverage on a Postgres 17 service) in 1m10s, frontend job (lint, typecheck, tests, build) in 28s. The latest run, on PR #2 ([run 40116182780](https://github.com/PrajotShrivastava/car-dealership-inventory/actions/runs/40116182780)), also **passed** (backend 1m2s, frontend 30s). Playwright e2e is not part of CI; it was run locally only.
- **`docker-compose.yml`** has **not been tested**: Docker isn't installed on this machine. Local development uses Homebrew Postgres 17.
- Only tested on **Python 3.14** and **Chromium**. `requires-python >=3.12` is declared but 3.12 and 3.13 weren't run.
- No load or performance testing, no automated accessibility audit, no penetration testing.
- Not implemented (outside the scope we agreed): login rate limiting, refresh tokens or token revocation, purchase-history UI, multiple currencies (prices display in USD).
