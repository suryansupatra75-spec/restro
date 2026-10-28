# Restaurant SaaS --- PHASES.md

## Development Roadmap and System Structure

------------------------------------------------------------------------

## Phase 1 --- Marketing + Foundation

**Current phase**

Deliver: - Landing page - Design system - UI primitives - Responsive
layout - SEO - Accessibility - Project documentation

Exit criteria: - Production build passes. - Landing page is complete. -
Architecture is ready for application modules.

------------------------------------------------------------------------

## Phase 2 --- Authentication + Restaurant Onboarding

Deliver: - Register - Login - Logout - Password reset - User profile -
Restaurant creation - Restaurant onboarding - Restaurant roles - Session
handling

Primary database entities: - users - restaurants - restaurant_users

------------------------------------------------------------------------

## Phase 3 --- Menu Management

Deliver: - Categories - Menu items - Images - Variants - Add-ons -
Availability - Sorting

Primary entities: - categories - menu_items - menu_item_variants -
addons - menu_item_addons

------------------------------------------------------------------------

## Phase 4 --- Tables + QR

Deliver: - Table creation - Table editing - QR token generation - QR
preview - QR download - QR regeneration - Public QR routing

Primary entities: - restaurant_tables - qr_codes

------------------------------------------------------------------------

## Phase 5 --- Customer Ordering

Deliver: - Public menu - Food detail - Cart - Guest checkout - Customer
information - Order creation - Order confirmation - Order tracking

Primary entities: - customers - orders - order_items - order_item_addons

------------------------------------------------------------------------

## Phase 6 --- Restaurant Order Management

Deliver: - Incoming order queue - Accept/reject - Preparing - Ready -
Served - Completed - Cancelled - Order detail - Notifications

------------------------------------------------------------------------

## Phase 7 --- Real-Time + Kitchen

Deliver: - Socket.IO/WebSocket layer - Live new-order notifications -
Customer status updates - Kitchen display - Reconnection handling

------------------------------------------------------------------------

## Phase 8 --- Payments

Deliver: - Payment provider integration - Payment status - Webhooks -
Payment reconciliation - Cash/online payment flows

Never mark a payment successful based only on client-side input.

------------------------------------------------------------------------

## Phase 9 --- Dashboard + Reports

Deliver: - Sales - Orders - Average order value - Popular items - Peak
hours - Category performance - Date filters - Export where appropriate

------------------------------------------------------------------------

## Phase 10 --- Super Admin + SaaS

Deliver: - Super admin - Restaurant management - Plans - Subscriptions -
Billing - Restaurant limits - Platform analytics - Audit logs

------------------------------------------------------------------------

## Phase 11 --- Advanced Features

Potential: - Inventory - Staff scheduling - Loyalty - Coupons - Customer
CRM - WhatsApp automation - Multi-location management - Custom domains -
White-labeling - AI analytics

These are not part of the MVP unless explicitly approved.

------------------------------------------------------------------------

# Recommended Architecture

Start as a modular monolith.

``` text
Web App
   |
   v
API / Server
   |
   +-- Auth
   +-- Restaurants
   +-- Menu
   +-- Tables
   +-- QR
   +-- Orders
   +-- Customers
   +-- Payments
   +-- Dashboard
   |
   v
PostgreSQL
```

Later infrastructure may add:

``` text
Redis
Background Jobs
Object Storage
WebSocket
Payment Provider
WhatsApp Provider
```

Do not split into microservices until scale or organizational
requirements justify it.

------------------------------------------------------------------------

# Core Data Ownership

Every restaurant-owned entity should be traceable to:

``` text
restaurant_id
```

Examples:

``` text
restaurant
 ├── categories
 ├── menu_items
 ├── tables
 ├── qr_codes
 ├── customers
 ├── orders
 ├── staff
 └── reports
```

------------------------------------------------------------------------

# Core User Journey

``` text
Restaurant registers
        ↓
Creates restaurant
        ↓
Adds menu
        ↓
Adds tables
        ↓
Generates QR codes
        ↓
Prints QR codes
        ↓
Customer scans
        ↓
Customer sees menu
        ↓
Customer orders
        ↓
Restaurant receives order
        ↓
Kitchen prepares
        ↓
Order completed
        ↓
Dashboard records transaction
```

This journey is the backbone of the entire system.
