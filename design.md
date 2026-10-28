# Restaurant SaaS --- design.md

## Design System and UI Direction

**Version:** 1.0\
**Phase:** Phase 1

------------------------------------------------------------------------

## 1. Design Objective

The product should feel like a modern, trustworthy restaurant operations
platform.

Design characteristics: - Clean - Premium but approachable - Fast and
practical - Strong visual hierarchy - Mobile-first - Minimal visual
noise - Clear calls to action

Avoid making it look like: - A generic template - A food delivery
marketplace - A complicated enterprise ERP - A flashy
gaming/productivity dashboard

------------------------------------------------------------------------

## 2. Brand Direction

Temporary product name: **Restaurant SaaS**

The final brand name can be changed without changing component
architecture.

Visual direction: - Neutral base - One strong brand accent -
High-quality food/product imagery - Soft surfaces and borders - Moderate
corner radius - Clear typography

Do not hard-code colors throughout components. Use design tokens.

------------------------------------------------------------------------

## 3. Design Tokens

Define tokens centrally.

### Colors

Use semantic names rather than component-specific names:

``` text
--background
--foreground
--surface
--surface-muted
--border
--muted-foreground
--primary
--primary-foreground
--secondary
--secondary-foreground
--success
--warning
--danger
```

The exact color values may be chosen during implementation, but all
components must reference the tokens.

### Typography

Use a modern sans-serif family.

Suggested hierarchy:

``` text
Display
H1
H2
H3
Body
Body Small
Caption
Button
```

Do not use more than two font families without a documented reason.

### Spacing

Use a consistent spacing scale.

Prefer:

``` text
4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 80 / 96
```

Avoid random one-off spacing values.

### Radius

Use a small set:

``` text
sm
md
lg
xl
full
```

------------------------------------------------------------------------

## 4. Layout

Maximum content width: approximately 1200--1280px.

Desktop page structure:

``` text
┌──────────────────────────────────────┐
│                NAVBAR                │
├──────────────────────────────────────┤
│                                      │
│                HERO                  │
│                                      │
├──────────────────────────────────────┤
│          PROBLEM / SOLUTION          │
├──────────────────────────────────────┤
│              FEATURES                │
├──────────────────────────────────────┤
│            HOW IT WORKS              │
├──────────────────────────────────────┤
│           PRODUCT PREVIEW            │
├──────────────────────────────────────┤
│              BENEFITS                │
├──────────────────────────────────────┤
│               CTA                    │
├──────────────────────────────────────┤
│              FOOTER                  │
└──────────────────────────────────────┘
```

------------------------------------------------------------------------

## 5. Components

Create reusable components:

``` text
Navbar
Button
Container
Section
SectionHeading
FeatureCard
FeatureGrid
StepCard
ProductPreview
Badge
CTASection
Footer
Logo
Icon
```

Do not duplicate identical markup across sections.

------------------------------------------------------------------------

## 6. Buttons

Primary: - High contrast - Strong visual priority - Clear action verb

Secondary: - Visually subordinate - Still clearly interactive

Destructive actions should not appear on the marketing landing page.

Buttons need: - Hover - Active - Focus - Disabled states where relevant

------------------------------------------------------------------------

## 7. Cards

Cards should not have excessive shadows.

Preferred hierarchy:

``` text
surface
border
subtle radius
small shadow only where useful
```

Avoid placing every section inside a card.

------------------------------------------------------------------------

## 8. Imagery

Images should support the product story.

Preferred: - Restaurant table - QR code interaction - Mobile digital
menu - Restaurant dashboard - Food/menu imagery

Do not use: - Watermarked images - Random stock photos that don't
support the story - Fake screenshots presented as real functionality -
Images containing unreadable text when UI can be built directly

------------------------------------------------------------------------

## 9. Animation

Animations should be subtle.

Allowed: - Fade/slide on section entrance - Hover transitions - Small
card movement - Navbar transition - Product mockup micro-interactions

Avoid: - Excessive parallax - Constant motion - Large distracting
animations - Animations that interfere with accessibility

Respect `prefers-reduced-motion`.

------------------------------------------------------------------------

## 10. Responsive Rules

### Mobile

-   Single-column layout
-   Compact navigation
-   Large touch targets
-   Horizontal overflow avoided
-   Hero content prioritized
-   Feature cards stacked

### Tablet

-   Two-column layouts where appropriate

### Desktop

-   Multi-column feature grids
-   Larger hero composition
-   Wider product previews

Never solve responsive issues by hiding important content.

------------------------------------------------------------------------

## 11. Accessibility

Minimum requirements: - Semantic elements - Proper heading hierarchy -
Keyboard accessible controls - Focus indicators - Alt text - Reduced
motion support - Form labels when forms are added - Color must not be
the only indicator of meaning

Target WCAG 2.2 AA practices where practical.

------------------------------------------------------------------------

## 12. UI States

Every interactive component should consider:

``` text
Default
Hover
Focus
Active
Disabled
Loading
Error
Success
Empty
```

For Phase 1, only applicable states need to be implemented.

------------------------------------------------------------------------

## 13. Component Architecture

Prefer:

``` text
components/
├── ui/
├── marketing/
└── layout/
```

Business/domain components should later live separately from generic UI
components.

Do not place restaurant-specific business logic inside generic
buttons/cards/layout components.

------------------------------------------------------------------------

## 14. Visual Consistency Rules

1.  One spacing system.
2.  One typography system.
3.  One icon family.
4.  One radius system.
5.  Use tokens instead of scattered values.
6.  Do not introduce a new color for a single component.
7.  Do not introduce a new button style for one CTA.
8.  Keep mobile and desktop versions visually related.
