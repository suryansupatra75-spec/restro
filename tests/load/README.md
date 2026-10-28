# Restaurant SaaS — Load Testing Suite

Automated, non-destructive, virtual-user load testing harness designed specifically for the Restaurant SaaS application running on Next.js 15, Prisma ORM, and SQLite WAL database.

---

## 🎯 Test Objectives

1. **Profile End-to-End Latency**: Measure `p50`, `p90`, `p95`, `p99`, `min`, `max`, and `mean` response times across critical customer and staff operations.
2. **Benchmark Throughput**: Profile requests per second (req/sec) under single-user baseline, light concurrency (5 VUs), and realistic restaurant peak (10 VUs).
3. **Detect Concurrency Bottlenecks**: Monitor SQLite write-lock contention, `busy_timeout` exhaustion (`SQLITE_BUSY: database is locked`), and race conditions.
4. **Safety & Zero Disruption**: Use strictly synthetic `LOADTEST_` tenant data with automated atomic teardown, zero mock payments, and automatic abort if error rates exceed 5%.

---

## 🏗️ Architecture & Scenario Weights

The harness simulates realistic dining room behavior:

| Scenario | Weight | Key Actions | Route Targets |
| :--- | :--- | :--- | :--- |
| **1. Customer Menu Browsing** | 75% | QR Code Scan & Render, Order Status Polling | `GET /q/[token]`, `GET /api/v1/orders/track` |
| **2. Waiter Service & Orders** | 15% | Service Calls (Water, Cutlery, Bill), Order Placement | `POST /api/v1/tables/call-waiter`, `POST /api/v1/orders` |
| **3. Staff & Kitchen Polling** | 10% | Live Orders Feed Polling, System Health | `GET /api/v1/orders/admin`, `GET /api/health` |

---

## 📁 File Structure

```text
tests/load/
├── fixtures.js        # Synthetic tenant seeder (LOADTEST_Bistro) and atomic cleanup
├── scenarios.js       # Weighted request generators with timing & SQLITE_BUSY detection
├── load-runner.js     # Multi-virtual-user execution engine and percentile aggregator
├── results/           # Timestamped structured JSON test run archives
└── README.md          # Test suite documentation & safety guide
```

---

## 🚀 Usage Commands

### 1. Run Complete Load Test Suite (All Stages)
```bash
node tests/load/load-runner.js --all
```

### 2. Run Individual Stages
- **Stage 0: Baseline Smoke Test** (1 VU, 30s):
  ```bash
  node tests/load/load-runner.js --stage=0
  ```
- **Stage 1: Light Concurrency** (5 VUs, 60s):
  ```bash
  node tests/load/load-runner.js --stage=1
  ```
- **Stage 2: Realistic Peak Concurrency** (10 VUs, 60s):
  ```bash
  node tests/load/load-runner.js --stage=2
  ```

### 3. Standalone Fixtures Management
- **Provision Synthetic Tenant Only**:
  ```bash
  node tests/load/fixtures.js
  ```
- **Emergency / Manual Synthetic Cleanup**:
  ```bash
  node tests/load/fixtures.js --clean
  ```

---

## 🛡️ Safety Invariants

- **Auto-Abort Protection**: If the aggregate error rate exceeds 5% after 25 requests, the load harness immediately aborts all virtual users to protect the server from cascading failure.
- **Zero External Integrations**: Cash payment methods are used during testing (`paymentMethod: "CASH"`), guaranteeing that external payment gateways (e.g. Razorpay) and email/SMS APIs are never triggered.
- **Atomic Cleanup**: The harness automatically purges all synthetic orders, payments, notifications, tables, and tenant records in foreign-key dependency order during the `finally` teardown phase.
