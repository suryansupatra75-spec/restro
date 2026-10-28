# 🍽️ Restro — Modern Multi-Tenant Restaurant OS & Contactless QR SaaS

> A production-grade, full-stack Restaurant Management System & Contactless QR Dining SaaS platform built with **Next.js 15 App Router**, **TypeScript**, **Tailwind CSS v4**, and **Prisma ORM**.

---

## ✨ Features at a Glance

### 📱 1. Customer Dining & QR Experience (`/q/[token]`)
* **Instant Digital Menu**: Diners scan a table QR code and immediately browse without mandatory name gates.
* **Dietary Preferences & Search**: 1-click filtering across `Veg Only`, `🥩 Non-Veg`, `Vegan`, and real-time dish search.
* **4-in-1 Contactless Table Service Calls**: Summon staff in 1 tap for **Call Waiter**, **Need Water**, **Extra Cutlery**, or **Request Bill** with automated 60s debounce protection.
* **Chef's Upsell Pairings**: Smart cross-category item recommendations integrated into the cart drawer.
* **Dynamic Bill Splitting**: Interactive 2–12 diner splitting with tip presets (10%, 15%, 20%) and instant WhatsApp share links.
* **Gamified Loyalty & Reputation Shield**: Post-order Scratch & Win reward cards stacked with a smart Google Review booster (routing 4–5★ reviews to Google with auto-generated dish reviews).

### 🖥️ 2. POS Order Dashboard (`/dashboard/orders`)
* **Active Table Service Calls Dock**: Real-time alerts bar with animated bell icon and 1-tap `✓ Attend` resolution.
* **Visual Order Lifecycle Stepper**: 5-stage progress indicator:
  $$\text{Received} \longrightarrow \text{Accepted} \longrightarrow \text{Kitchen} \longrightarrow \text{Ready} \longrightarrow \text{Served}$$
* **Instant Active Order Sub-Filters**: Filter by `All Active`, `New (Pending)`, `Accepted`, `In Kitchen`, and `Ready` with real-time badges.
* **Zero-Latency Web Audio Chimes**: Synthesized in-browser sound alerts for incoming orders and table waiter calls (no external audio assets).

### 🗺️ 3. Interactive Floor Plan & Tables (`/dashboard/tables`)
* **Real-time Seating Stats**: Instant KPI metrics for Total Tables, Available Tables, Occupied Seating, and Total Seating Capacity.
* **Section Filter Tabs**: Dynamic floor tabs across `All Sections`, `Main Dining`, `Patio`, `Rooftop`, and `Bar`.
* **Live Occupancy Pills**: Real-time status badges (`🟢 Available` vs. `🟠 Occupied • #ORD-XXX • ₹YYY`) with active bill amounts.

### 🍳 4. Kitchen Display System - KDS (`/dashboard/kitchen`)
* **3-Column Kanban Workflow**: Live routing across *Incoming*, *Preparing*, and *Ready* lanes with elapsed cooking timers.
* **Item-Level Instructions**: Highlights dish customization notes and portions clearly for the kitchen line.
* **Instant Thermal Ticket Actions**: 1-click Print KOT and mark ready.

### 🛡️ 5. Robust Multi-Tenant Backend & Security
* **Binary Magic-Byte Inspection (`/api/v1/upload`)**: Inspects initial byte signatures for JPEG, PNG, GIF, WEBP, and AVIF, blocking disguised files.
* **Authoritative Server-Side Pricing Engine**: Recalculates all dish prices, variant modifiers, addons, coupons, and loyalty points in atomic transactions.
* **Multi-Tenant Guarding**: Strict isolation between restaurants enforcing zero cross-tenant data leaks.
* **Cross-Tab Real-Time Sync**: Native `BroadcastChannel` synchronization across open staff POS terminals, kitchen screens, and customer devices.

---

## 🛠️ Tech Stack

* **Framework**: [Next.js 15 (App Router)](https://nextjs.org/)
* **Language**: [TypeScript](https://www.typescriptlang.org/)
* **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
* **Database & ORM**: [Prisma ORM](https://www.prisma.io/) with SQLite (WAL mode) / PostgreSQL support
* **Icons**: [Lucide React](https://lucide.dev/)
* **Audio Engine**: Native HTML5 Web Audio API synthesizer
* **Testing & Build**: Node.js test suites & standalone Next.js production builds

---

## 🚀 Quick Start

### 1. Clone the repository
```bash
git clone https://github.com/suryansupatra75-spec/restro.git
cd restro
```

### 2. Install dependencies
```bash
npm install
```

### 3. Setup environment variables
```bash
cp .env.example .env
```

### 4. Initialize Database
```bash
npx prisma db push
```

### 5. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## 📦 Production Deployment

### Build and Run
```bash
npm run build
npm start
```

### Docker
```bash
docker compose up -d
```

---

## 📄 License
MIT License. Built for modern restaurant operations.
