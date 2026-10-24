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
| Backend (pytest, real PostgreSQL `drivestock_test`) | **97 passed**, 0 failed (≈9 s) | **98 %** statements (500 stmts, 10 missed) |
| Frontend (Vitest + React Testing Library + MSW) | **49 passed**, 0 failed | **93.0 %** stmts · 84.3 % branches · 90.2 % funcs · 93.8 % lines |
| End-to-end (Playwright, Chromium, real API + PostgreSQL) | **4 passed**, 4 skipped¹ | n/a |
| Static checks | ruff ✔ · ruff format ✔ · mypy `--strict` ✔ · oxlint 0 warnings · `tsc --noEmit` ✔ · production build ✔ | |

¹ The 4 skipped tests are `e2e/screenshots.spec.ts`. They only run with `SCREENSHOTS=1` (`npm run screenshots`) and capture the README images.

## Backend tests by file

| File | Tests | What it covers |
|---|---|---|
| `test_auth.py` | 11 | register (lowercased email, argon2 hash, role can't be self-assigned, duplicate → 409, field-level 422), login (token, identical generic 401 for wrong password vs unknown email), `/me` (missing, tampered and expired tokens → 401) |
| `test_vehicles_crud.py` | 29 | 401 on every endpoint without a token, 403 for customer create/update/delete, create/read/update/delete, trimming, 11 invalid-field cases, empty inventory, 404s, `quantity` rejected on PUT |
| `test_vehicles_search.py` | 22 | free-text search over make/model/trim (multi-word, LIKE wildcards treated literally), make/model/category/price range/availability filters, combined filters, faceted counts, sorting, paging, 8 invalid-query cases |
| `test_inventory_actions.py` | 20 | purchase (default 1, multiple units, price snapshot, totals), out-of-stock and insufficient-stock 409s with no side effects, 404, invalid quantities, **concurrency**, restock (admin-only, 401/403/404/422), deleting a sold vehicle keeps purchase history |
| `test_hardening.py` | 8 | JSON 500 with no internals, out-of-range IDs → 422 on all 5 ID routes, offset cap, 100,000-unit stock ceiling |
| `test_cli.py` | 6 | `create-admin` (hashing, duplicate, validation, environment password), `seed` (runs once only, includes out-of-stock cars) |
| `test_health.py` | 1 | health check |

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
| `features/inventory/InventoryPage.test.tsx` | 15 | list, empty inventory, load error and retry, search, category, availability counts, price range, clear filters, sort, paging, details drawer (Escape), purchase updates stock, quantity capped at stock, out-of-stock disabled, server rejection shown |
| `features/inventory/format.test.ts` | 9 | price formatting, stock thresholds, labels |
| `features/admin/admin.test.tsx` | 9 | customers see no admin controls; admin add (with client-side and API field errors), edit, restock (valid and invalid amounts), delete with confirm and cancel |

Unit tests use an in-memory MSW fake of the API contract (`src/test/handlers.ts`). The Playwright suite then checks the same flows against the real API and database.

## End-to-end (real stack)

Playwright starts the API on :8001 against the `drivestock_test` database, reset by `backend/scripts/prepare_e2e_db.py`, which refuses any database not named `*_test`, plus Vite on :5174.

1. A customer registers, searches "kuga", buys 2 units, and sees stock drop from 6 to 4. **It's still 4 after a full page reload**, so the purchase is persisted.
2. An out-of-stock vehicle's purchase button is disabled.
3. An admin adds a vehicle with 0 stock, edits its price, restocks 3 units, then deletes it.
4. Direct API calls with a customer token to `restock` and `DELETE` return **403**, so permissions are enforced on the server, not just hidden in the UI.

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

## Not verified / known gaps

- **CI workflow** (`.github/workflows/ci.yml`) has **never run**: nothing has been pushed to a remote.
- **`docker-compose.yml`** has **not been tested**: Docker isn't installed on this machine. Local development uses Homebrew Postgres 17.
- Only tested on **Python 3.14** and **Chromium**. `requires-python >=3.12` is declared but 3.12 and 3.13 weren't run.
- No load or performance testing, no automated accessibility audit, no penetration testing.
- Not implemented (outside the scope we agreed): login rate limiting, refresh tokens or token revocation, purchase-history UI, multiple currencies (prices display in USD).
