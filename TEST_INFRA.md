# Test Infrastructure Specification (TEST_INFRA.md)

## 1. Overview & Test Harness Architecture

This document defines the automated end-to-end (E2E) testing infrastructure for the Multi-Tenant Restaurant SaaS platform. The test suite operates as an **opaque-box testing harness** executing against the live production server (`http://localhost:3000`) backed by SQLite WAL mode database (`prisma/dev.db`).

The test runner interacts with the system strictly via HTTP/HTTPS network calls, simulating real browser clients, customer mobile devices, restaurant POS terminals, kitchen display hardware, and SaaS super-admin consoles.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Opaque-Box E2E Test Suite Runner                     │
│                     (scripts/e2e-tier-suite.mjs)                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP 1.1 / JSON / Cookie Headers
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│              Next.js 15 Production Server (Port 3000)                  │
├───────────────────┬───────────────────┬────────────────────────────────┤
│   Public Views    │  Customer Menu    │   Staff & Admin Dashboards     │
│  /, /login, ...   │  /q/[token]       │   /dashboard/*, /super-admin/* │
├───────────────────┴───────────────────┴────────────────────────────────┤
│               API Layer (/api/v1/*, /api/ready, /api/health)           │
├────────────────────────────────────────────────────────────────────────┤
│             Prisma ORM with SQLite WAL Database (prisma/dev.db)        │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Principles
1. **Opaque-Box Verification**: Tests make HTTP requests and evaluate status codes, JSON response envelopes, HTML layout markers, and observable state side-effects.
2. **Deterministic Preconditions**: Uses authentic fixtures seeded in the database (`usera@t.com`, `superadmin@platform.com`, active table token `9c3fac487338425c`).
3. **Idempotency & Clean Teardown**: Dynamic orders and temporary records utilize dedicated test run identifiers to prevent state corruption.
4. **Latency Verification**: Server response times on warmed views and health endpoints are benchmarked against strict sub-100ms thresholds.

---

## 2. The 4-Tier Testing Methodology

The test suite is structured according to a hierarchical 4-tier model:

```
┌────────────────────────────────────────────────────────┐
│  Tier 4: Real-World Application Scenarios              │
│  (End-to-End Multi-Actor Journeys & State Lifecycles)  │
├────────────────────────────────────────────────────────┤
│  Tier 3: Cross-Feature Combinations                    │
│  (Pairwise Feature Interactions & Cascading Effects)   │
├────────────────────────────────────────────────────────┤
│  Tier 2: Boundary & Corner Cases                       │
│  (>=5 per Feature: Malformed, Empty, Overflow, RBAC)   │
├────────────────────────────────────────────────────────┤
│  Tier 1: Feature Coverage                              │
│  (>=5 per Feature: Happy Paths, Status Codes, Schemas) │
└────────────────────────────────────────────────────────┘
```

### Tier 1: Feature Coverage (>=5 tests per core feature)
Focuses on baseline functionality and interface contracts for every core feature area:
- Valid payload submissions returning HTTP 200/201.
- Expected data structures in JSON responses.
- HTML render integrity and critical DOM marker presence.
- Session cookie issuance and authentication headers.
- Accurate calculation of totals, taxes, and discounts.

### Tier 2: Boundary & Corner Cases (>=5 tests per core feature)
Stresses the system at boundary conditions, edge cases, and failure modes:
- Invalid, expired, and tampered QR tokens (404/400).
- Negative quantities, empty item arrays, and zero-sum carts.
- Cross-tenant data isolation and unauthorized IDOR attempts (403).
- Rapid consecutive waiter calls triggering 30s debounce protection.
- Unauthenticated access attempts to protected dashboard and super-admin routes (307 redirect to `/login`).
- SQL/HTML injection payloads in search, notes, and profile fields.
- Non-admin users attempting to access `/super-admin` perimeter (403 forbidden).

### Tier 3: Cross-Feature Combinations (Pairwise Coverage)
Validates interactions between disparate system modules:
1. **Customer Order -> Staff POS**: Placing an order via `/api/v1/orders` immediately surfaces on `/dashboard/orders`.
2. **Staff POS -> Kitchen KDS**: Status transition to `PREPARING` updates the KDS kanban board in real time.
3. **KDS Completion -> Inventory Depletion**: Bumping an order to `COMPLETED` decrements mapped ingredient inventory.
4. **Waiter Call Dock -> Staff Notifications**: Customer waiter alert generates a high-priority notification record for floor staff.
5. **Settings URL -> Customer Review Card**: Updating `googleReviewUrl` in restaurant settings propagates immediately to `/q/[token]` review card.
6. **Double Submission -> Idempotency Guard**: Re-submitting identical orders with the same `idempotencyKey` returns the original order without creating duplicate database rows.
7. **Order Rejection -> Stock & Loyalty Rollback**: Rejecting a preparing order restores deducted stock and reverses loyalty points.
8. **Super Admin Tenant Suspension -> Route Lockdown**: Suspending a restaurant halts customer QR ordering while maintaining data integrity.

### Tier 4: Real-World Application Scenarios
End-to-end integration workflows simulating realistic dining scenarios:
- **Scenario A: Full Customer In-Dining Journey**: Customer scans QR code -> filters by vegan items -> adds dish with modifiers -> submits order with cash payment -> calls waiter for cutlery -> views digital receipt -> copies dish-personalized Google review.
- **Scenario B: Rush Hour Kitchen & POS Workflow**: Multiple orders placed -> POS staff confirms -> Kitchen prepares on KDS -> Status bumped to READY -> Waiter delivers -> Order marked COMPLETED -> Revenue reflected in Analytics.
- **Scenario C: Platform Administration & Tenant Onboarding**: Super Admin logs in -> inspects platform KPIs -> reviews tenant directory -> verifies audit log immutability -> audits platform plan entitlements.

---

## 3. Core Feature Inventory (15 Feature Areas)

| Feature ID | Feature Name | Tier 1 Tests | Tier 2 Tests | Tier 3 Pairs | Tier 4 Scenarios |
|------------|--------------|--------------|--------------|--------------|------------------|
| **F-AUTH** | Public & Authentication Lifecycle | 5 | 5 | 2 | 1 |
| **F-MENU** | Customer QR Menu & Dietary Filters | 5 | 5 | 2 | 1 |
| **F-ORDER** | Cart Tray & Idempotent Ordering | 5 | 5 | 2 | 1 |
| **F-WAITER**| Table Service Waiter Call Dock | 5 | 5 | 2 | 1 |
| **F-REVIEW**| Customer Google Review Card | 5 | 5 | 2 | 1 |
| **F-POS**   | Staff POS & Live Order Lifecycle | 5 | 5 | 2 | 1 |
| **F-KDS**   | Kitchen Display System (KDS) | 5 | 5 | 2 | 1 |
| **F-TABLE** | Table Management & QR Codes | 5 | 5 | 1 | 1 |
| **F-INVENT**| Inventory Stock & Auto-Depletion | 5 | 5 | 2 | 1 |
| **F-ANALYT**| Analytics & Financial Reporting | 5 | 5 | 1 | 1 |
| **F-SETT**  | Restaurant Profile & Settings | 5 | 5 | 2 | 1 |
| **F-STAFF** | Staff Management & RBAC Roles | 5 | 5 | 2 | 1 |
| **F-BILL**  | Subscription Tiers & Billing | 5 | 5 | 1 | 1 |
| **F-SADMIN**| Super Admin Platform Perimeter | 5 | 5 | 2 | 1 |
| **F-PERF**  | 28-View Matrix & Sub-100ms Latency | 28 views | 5 edge views | 2 warm runs | 1 load run |

---

## 4. Comprehensive 28-View Verification Matrix

The test suite systematically queries all 28 views of the SaaS application:

| # | Route | Category | Expected Status | Auth Requirement |
|---|-------|----------|-----------------|------------------|
| 1 | `/` | Public | 200 OK | None |
| 2 | `/login` | Public / Auth | 200 OK | None |
| 3 | `/register` | Public / Auth | 200 OK | None |
| 4 | `/q/[token]` | Customer Mobile | 200 OK | Valid QR Token |
| 5 | `/dashboard` | Staff Dashboard | 200 OK | Restaurant Owner/Staff Session |
| 6 | `/dashboard/orders` | Staff POS | 200 OK | Restaurant Owner/Staff Session |
| 7 | `/dashboard/kitchen` | Staff KDS | 200 OK | Restaurant Owner/Kitchen Session |
| 8 | `/dashboard/menu` | Staff Operations | 200 OK | Restaurant Owner/Manager Session |
| 9 | `/dashboard/menu/categories` | Staff Operations | 200 OK | Restaurant Owner/Manager Session |
| 10 | `/dashboard/menu/items/new` | Staff Operations | 200 OK | Restaurant Owner/Manager Session |
| 11 | `/dashboard/menu/preview` | Staff Operations | 200 OK | Restaurant Owner/Manager Session |
| 12 | `/dashboard/tables` | Staff Operations | 200 OK | Restaurant Owner/Manager Session |
| 13 | `/dashboard/inventory` | Staff Operations | 200 OK | Restaurant Owner/Manager Session |
| 14 | `/dashboard/customers` | Staff Operations | 200 OK | Restaurant Owner/Manager Session |
| 15 | `/dashboard/analytics` | Staff Operations | 200 OK | Restaurant Owner/Manager Session |
| 16 | `/dashboard/promotions` | Staff Operations | 200 OK | Restaurant Owner/Manager Session |
| 17 | `/dashboard/loyalty` | Staff Operations | 200 OK | Restaurant Owner/Manager Session |
| 18 | `/dashboard/receipts` | Staff Operations | 200 OK | Restaurant Owner/Manager Session |
| 19 | `/dashboard/settings` | Staff Operations | 200 OK | Restaurant Owner/Manager Session |
| 20 | `/dashboard/integrations`| Staff Operations | 200 OK | Restaurant Owner/Manager Session |
| 21 | `/dashboard/staff` | Staff Operations | 200 OK | Restaurant Owner Session |
| 22 | `/dashboard/audit-logs` | Staff Operations | 200 OK | Restaurant Owner Session |
| 23 | `/dashboard/billing` | Staff Operations | 200 OK | Restaurant Owner Session |
| 24 | `/super-admin` | Super Admin | 200 OK | Super Admin Session |
| 25 | `/super-admin/restaurants` | Super Admin | 200 OK | Super Admin Session |
| 26 | `/super-admin/users` | Super Admin | 200 OK | Super Admin Session |
| 27 | `/super-admin/plans` | Super Admin | 200 OK | Super Admin Session |
| 28 | `/super-admin/audit-logs` | Super Admin | 200 OK | Super Admin Session |

---

## 5. Performance & Sub-100ms Latency Criteria

| Endpoint / View | Benchmark Type | Target Latency | Pass Condition |
|-----------------|----------------|----------------|----------------|
| `GET /api/health` | Warm Probe | < 50ms | HTTP 200, status === "ok" |
| `GET /api/ready` | DB Probe | < 100ms | HTTP 200, database === "connected" |
| `GET /` | Static SSR | < 100ms (warm) | HTTP 200, valid HTML |
| `GET /login` | Static SSR | < 100ms (warm) | HTTP 200, valid HTML |
| `GET /q/[token]` | Cached Dynamic | < 100ms (warm) | HTTP 200, valid menu HTML |
| `GET /dashboard/orders` | Authenticated SSR | < 100ms (warm) | HTTP 200, valid POS HTML |
| `POST /api/v1/tables/call-waiter` | Light Write | < 100ms (warm) | HTTP 200, success === true |
| `GET /api/v1/analytics` | Analytical Query | < 100ms (warm) | HTTP 200, JSON KPI object |

---

## 6. Execution Command

```bash
node scripts/e2e-tier-suite.mjs
```

Exit code: `0` indicates 100% pass across all tiers; non-zero indicates assertion failure.
