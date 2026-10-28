# Restaurant SaaS --- Phase 1 PRD

## Product Requirements Document

**Version:** 1.0\
**Phase:** Phase 1 --- Public Landing Page + Project Foundation\
**Primary audience:** Restaurant/cafe owners and operators\
**Product type:** Multi-tenant SaaS for QR menus and restaurant ordering

------------------------------------------------------------------------

## 1. Purpose

Build the first production-quality public page for the Restaurant SaaS
product.

The first page is the **marketing landing page**. Its job is to clearly
explain the product, demonstrate the QR-to-order workflow, establish
trust, and guide restaurant owners toward a demo/signup.

Phase 1 must establish the project's visual language, reusable
components, coding conventions, environment structure, and documentation
so later phases can extend the same system without redesigning the
foundation.

------------------------------------------------------------------------

## 2. Phase 1 Goals

1.  Create a polished responsive landing page.
2.  Make the product understandable within a few seconds.
3.  Explain the complete workflow: **Create menu → Generate QR →
    Customer scans → Customer orders → Restaurant manages orders.**
4.  Establish reusable design tokens and UI components.
5.  Establish the application folder structure and development rules.
6.  Keep the implementation ready for later authentication, restaurant
    dashboard, customer menu, QR, ordering, and super-admin modules.
7.  Do not build backend/business functionality in Phase 1 unless
    required for the landing-page shell.

------------------------------------------------------------------------

## 3. Target Users

### Primary

-   Restaurant owners
-   Cafe owners
-   Small food businesses
-   Cloud kitchens
-   Multi-table restaurants

### Secondary

-   Restaurant managers
-   Staff/operators
-   Future franchise/multi-location operators

------------------------------------------------------------------------

## 4. Core Value Proposition

The product gives food businesses one system to manage:

-   Digital menus
-   Table QR codes
-   Customer ordering
-   Incoming orders
-   Order status
-   Restaurant operations
-   Reports and analytics

The landing page should communicate this without overwhelming the
visitor with technical details.

------------------------------------------------------------------------

## 5. Landing Page Information Architecture

Route:

`/`

Sections, in this order:

### 5.1 Navbar

-   Product logo/name
-   Features
-   How it works
-   Pricing placeholder
-   Login
-   Primary CTA: **Get Started**

Navbar becomes sticky or compact on scroll.

### 5.2 Hero

Headline should communicate the outcome, not the technology.

Suggested direction:

**"Turn Every Table Into a Digital Ordering Experience."**

Supporting text: - QR menu - Direct table ordering - Real-time order
management - One dashboard for the restaurant

Primary CTA: **Get Started**

Secondary CTA: **See How It Works**

Hero visual: - Restaurant/table context - QR code - Mobile menu
preview - Order/admin status preview

Do not use fake statistics or fake customer logos.

### 5.3 Problem / Solution

Show common restaurant pain points: - Printed menus become outdated. -
Staff spend time taking repetitive orders. - Orders can be missed or
misunderstood. - Owners lack a simple operational overview.

Then show how the platform addresses them.

### 5.4 Feature Grid

Initial feature cards: 1. Digital QR Menu 2. Table Ordering 3. Real-Time
Orders 4. Menu Management 5. Kitchen/Staff Workflow 6. Dashboard &
Reports

Each card should have a short explanation.

### 5.5 How It Works

Four steps: 1. Add your restaurant and menu. 2. Create tables and QR
codes. 3. Place QR codes on tables. 4. Customers scan, order, and the
restaurant manages the order.

### 5.6 Product Preview

Use polished UI mockups or actual reusable UI components. Show: -
Customer menu - Cart/order screen - Restaurant order dashboard

The preview must clearly indicate that these are product interfaces.

### 5.7 Benefits

Focus on operational outcomes: - Faster ordering workflow - Fewer manual
order-taking steps - Easier menu updates - Centralized order
visibility - Better customer experience

Avoid unsupported claims such as guaranteed revenue increases.

### 5.8 Final CTA

Example: **Ready to modernize your restaurant ordering?**

CTA: **Get Started**

### 5.9 Footer

-   Product
-   Features
-   Contact
-   Privacy
-   Terms
-   Login
-   Copyright

Legal pages can be placeholders in Phase 1, but links should be
structurally ready.

------------------------------------------------------------------------

## 6. Functional Requirements

### FR-01 Responsive

The page must work on: - Mobile - Tablet - Desktop - Large desktop

### FR-02 Navigation

Navbar links must scroll/navigate to the correct section.

### FR-03 CTA

All primary CTAs must use one reusable CTA component.

### FR-04 Accessibility

-   Semantic HTML
-   Keyboard navigation
-   Visible focus states
-   Accessible button/link names
-   Sufficient text contrast
-   Meaningful alt text for informative images

### FR-05 Performance

-   Optimize images.
-   Avoid unnecessary JavaScript.
-   Lazy-load below-the-fold media where appropriate.
-   Avoid large animation libraries unless genuinely needed.

### FR-06 SEO

Include: - Page title - Meta description - Open Graph metadata -
Canonical URL placeholder - Semantic heading hierarchy - Descriptive
page structure

### FR-07 Error-free build

The project must pass: - Type checking - Linting - Production build

No knowingly ignored build errors.

------------------------------------------------------------------------

## 7. Non-Goals for Phase 1

Do NOT implement yet: - Restaurant registration backend - Authentication
backend - PostgreSQL schema - Real QR generation - Real orders -
Payments - WhatsApp integration - Inventory - Subscription billing -
Customer accounts - Kitchen workflow backend - Super-admin functionality

Those belong to later phases.

------------------------------------------------------------------------

## 8. Definition of Done

Phase 1 is complete when:

-   Landing page is fully responsive.
-   All sections are implemented.
-   Design system is reusable.
-   CTA and navigation work.
-   No placeholder lorem ipsum remains.
-   No fake metrics/testimonials are presented as real.
-   Accessibility basics are implemented.
-   SEO metadata exists.
-   `npm run lint` passes.
-   `npm run build` passes.
-   Project documentation is updated.
-   The codebase is ready for Phase 2 without restructuring the entire
    app.

------------------------------------------------------------------------

## 9. Suggested Phase 1 Technology

Preferred: - Next.js - TypeScript - Tailwind CSS or an equivalent
token-based styling system - Reusable React components - Lucide or
another consistent icon library - ESLint - Prettier

Do not add libraries merely because they are popular. Every dependency
should have a reason.

------------------------------------------------------------------------

## 10. Future Phase Boundary

After Phase 1, Phase 2 should begin with:

**Authentication + Restaurant onboarding + database foundation.**

The landing page should not need to be rewritten when Phase 2 starts.
