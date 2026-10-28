# Restaurant SaaS Analytics & Reporting — Metric Definitions & Business Rules

## 1. Overview
This document defines every Key Performance Indicator (KPI), breakdown calculation, date boundary rule, and status inclusion/exclusion policy implemented for the Restaurant Management SaaS Analytics & Reporting engine (Phase 13).

---

## 2. Date Ranges & Boundary Rules
- **Timezone**: All date-range boundaries are evaluated within the restaurant's configured timezone (`Restaurant.timezone`, fallback: `UTC`).
- **Start Boundary**: `00:00:00.000` (inclusive).
- **End Boundary**: `23:59:59.999` (inclusive).
- **Preset Definitions**:
  - `today`: Current date from 00:00:00.000 to 23:59:59.999.
  - `yesterday`: Previous day from 00:00:00.000 to 23:59:59.999.
  - `7d`: Rolling last 7 days ending today.
  - `30d`: Rolling last 30 days ending today.
  - `this_month`: 1st day of current month to current day.
  - `prev_month`: 1st day of previous month to last day of previous month.
  - `custom`: Explicit `startDate` and `endDate` in `YYYY-MM-DD` format (maximum allowed range: 366 days).
- **Comparison Period**:
  - For a selected window $[T_{start}, T_{end}]$ with duration $\Delta = T_{end} - T_{start}$, the comparative prior period is $[T_{start} - \Delta, T_{start}]$.
  - Percentage change: $\Delta\% = \frac{\text{Current} - \text{Previous}}{\text{Previous}} \times 100$ (if $\text{Previous} = 0$, $\Delta\% = 0\%$).

---

## 3. Order & Financial KPI Definitions

### 3.1 Total Orders Placed
- **Definition**: Count of all `Order` records created within the selected date range.
- **Formula**: `COUNT(Order WHERE restaurantId = :id AND createdAt >= :start AND createdAt <= :end)`
- **Inclusions**: Includes all order states (`PENDING`, `ACCEPTED`, `PREPARING`, `READY`, `COMPLETED`, `CANCELLED`).
- **Purpose**: Measures total guest ordering volume/traffic.

### 3.2 Completed Orders
- **Definition**: Orders that reached the terminal completed state within the period.
- **Formula**: `COUNT(Order WHERE restaurantId = :id AND status = 'COMPLETED' AND createdAt >= :start AND createdAt <= :end)`
- **Inclusions**: `COMPLETED` only.

### 3.3 Cancelled / Rejected Orders
- **Definition**: Orders that were aborted by the guest, staff, or kitchen.
- **Formula**: `COUNT(Order WHERE restaurantId = :id AND status = 'CANCELLED' AND createdAt >= :start AND createdAt <= :end)`
- **Inclusions**: `CANCELLED` only.

### 3.4 In-Progress Orders
- **Definition**: Orders currently being fulfilled or awaiting action.
- **Formula**: `COUNT(Order WHERE restaurantId = :id AND status IN ('PENDING', 'ACCEPTED', 'PREPARING', 'READY') AND createdAt >= :start AND createdAt <= :end)`

### 3.5 Gross Sales / Total Order Value
- **Definition**: Cumulative revenue of all non-cancelled orders created within the date range.
- **Formula**: `SUM(Order.total WHERE restaurantId = :id AND status != 'CANCELLED' AND createdAt >= :start AND createdAt <= :end)`
- **Exclusions**: Cancelled orders (`status = 'CANCELLED'`) are strictly excluded.
- **Note**: Reflects total guest commitment prior to payment method settlement.

### 3.6 Net Sales
- **Definition**: Gross revenue excluding sales tax and refunded payments.
- **Formula**: `SUM(Order.subtotal WHERE status != 'CANCELLED') - SUM(Payment.amount WHERE status = 'REFUNDED')`
- **Exclusions**: Taxes (`Order.tax`), cancelled orders, and verified refunded payments.

### 3.7 Average Order Value (AOV)
- **Definition**: The average monetary value of qualifying guest orders.
- **Formula**: $\text{AOV} = \frac{\text{Gross Sales}}{\text{Non-Cancelled Order Count}}$
- **Zero Denominator Policy**: If non-cancelled order count is $0$, AOV is $0.00$.

---

## 4. Payment Settlement KPIs
Uses Phase 9 `Payment` table records linked to the restaurant:

### 4.1 Paid Revenue (Collected Payments)
- **Formula**: `SUM(Payment.amount WHERE restaurantId = :id AND status = 'PAID' AND createdAt >= :start AND createdAt <= :end)`
- **Purpose**: Represents funds successfully captured through payment providers (e.g. Razorpay, Cash).

### 4.2 Payment Status Breakdown
- **Paid**: `COUNT(Payment WHERE status = 'PAID')`
- **Pending**: `COUNT(Payment WHERE status = 'PENDING')`
- **Failed**: `COUNT(Payment WHERE status = 'FAILED')`
- **Refunded**: `COUNT(Payment WHERE status = 'REFUNDED')`

---

## 5. Item & Category Breakdown

### 5.1 Top Selling Items
- **Definition**: Aggregation of order items from non-cancelled orders within the period.
- **Fields**: Item name, quantity sold (`SUM(OrderItem.quantity)`), total sales generated (`SUM(OrderItem.quantity * OrderItem.price)`), and order count.
- **Immutable Snapshots**: Uses the persisted `OrderItem.name` and `OrderItem.price` snapshots captured at order creation.

### 5.2 Category Breakdown
- **Definition**: Sales and quantity aggregated by the menu item's category.
- **Formula**: Aggregates `OrderItem` joined to `MenuItem.category.name`.

---

## 6. Customer Insights (Privacy-Preserving)

### 6.1 Unique Customers
- **Definition**: Distinct count of identifiable customers with non-cancelled orders in the period.
- **Formula**: `COUNT(DISTINCT Order.customerId WHERE customerId IS NOT NULL AND status != 'CANCELLED')`

### 6.2 New Customers
- **Definition**: Customers whose account/record was first created within the period.
- **Formula**: `COUNT(Customer WHERE restaurantId = :id AND createdAt >= :start AND createdAt <= :end)`

### 6.3 Returning Customers
- **Definition**: Customers who ordered during this period and have more than 1 lifetime order.
- **Formula**: Distinct customers in period whose lifetime non-cancelled order count $> 1$.

### 6.4 Repeat Order Rate
- **Formula**: $\frac{\text{Returning Customers}}{\text{Unique Customers}} \times 100$ (0% if Unique Customers = 0).

---

## 7. Inventory Operational Snapshot

### 7.1 Real-Time Stock Status (Current State)
- **Low Stock Count**: Current active items where `currentStock > 0 AND currentStock <= lowStockThreshold`.
- **Out of Stock Count**: Current active items where `currentStock <= 0`.
- *Note*: Current stock is a live operational state and not retroactively reconstructed for past date ranges.

### 7.2 Period Stock Movements
- Aggregates movements in `InventoryMovement` where `createdAt >= :start AND createdAt <= :end`:
  - **Stock Received**: Sum of positive quantities for `type = 'STOCK_RECEIVED'`.
  - **Waste Recorded**: Sum of negative quantities for `type = 'WASTE'`.
  - **Manual Adjustments**: Count of `ADJUSTMENT_INCREASE` and `ADJUSTMENT_DECREASE`.
