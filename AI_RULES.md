# Restaurant SaaS --- AI_RULES.md

## Rules and Regulations for AI Development Agents

**Purpose:** This file governs AI coding agents such as Antigravity
working on the project.

------------------------------------------------------------------------

## 1. Core Rule

The AI must treat the repository as a real production software project.

Do not generate disposable demo code when production-oriented
architecture is requested.

Before making structural changes: 1. Inspect the existing repository. 2.
Read relevant documentation. 3. Reuse existing components where
appropriate. 4. Preserve working functionality. 5. Make the smallest
coherent change required.

------------------------------------------------------------------------

## 2. Phase Discipline

The project is developed in phases.

### Phase 1

Only: - Landing page - Design system - Reusable UI foundations - Project
structure - Documentation - Basic SEO/accessibility

Do not prematurely implement: - Orders - Payments - Authentication
backend - Restaurant database - WhatsApp - Inventory - Subscriptions

If a future feature requires a placeholder, create the
interface/contract only when necessary.

------------------------------------------------------------------------

## 3. Product Architecture Rules

The final product is a multi-tenant SaaS.

Future restaurant-owned data must be scoped by `restaurant_id`.

Never assume there is only one restaurant.

Do not create global restaurant-specific state.

Future authorization must verify:

``` text
authenticated user
+
restaurant membership
+
role/permission
+
resource ownership
```

------------------------------------------------------------------------

## 4. Security Rules

Never: - Hard-code secrets - Commit API keys - Commit passwords - Put
private credentials in frontend code - Trust client-supplied restaurant
IDs without server authorization - Expose database credentials - Disable
security checks to make a feature work

Use environment variables for secrets.

Example:

``` text
DATABASE_URL=
JWT_SECRET=
NEXT_PUBLIC_APP_URL=
```

Public environment variables must never contain secrets.

------------------------------------------------------------------------

## 5. Database Rules

When the database is introduced: - Use PostgreSQL. - Use migrations. -
Use UUIDs or another consistent identifier strategy. - Add foreign
keys. - Add indexes based on query patterns. - Add timestamps. - Use
transactions where multiple writes must remain consistent.

Do not silently delete production data.

Prefer soft deletion for important business entities when appropriate.

------------------------------------------------------------------------

## 6. API Rules

API conventions must be consistent.

Use:

``` text
/api/v1/...
```

Validate all external input.

Return predictable response structures.

Never trust: - URL parameters - request body - query parameters -
headers

without validation.

Use proper HTTP status codes.

Do not expose internal stack traces in production responses.

------------------------------------------------------------------------

## 7. Frontend Rules

Use TypeScript.

Avoid:

``` text
any
```

unless there is a documented reason.

Keep components small and reusable.

Separate: - UI - API/service logic - domain/business logic - state
management

Do not put large business rules inside page components.

------------------------------------------------------------------------

## 8. Design Rules

Read `design.md` before creating UI.

Use design tokens.

Do not invent random: - colors - fonts - spacing - button styles - card
styles

Maintain responsive behavior.

Every important interaction needs appropriate loading/error/empty states
when applicable.

------------------------------------------------------------------------

## 9. Accessibility Rules

Use semantic HTML.

Interactive elements must be keyboard accessible.

Images need appropriate alt text.

Do not rely only on color to communicate state.

Respect reduced-motion preferences.

------------------------------------------------------------------------

## 10. Content Rules

Never invent: - Customer testimonials - Restaurant logos - Revenue
numbers - User counts - Awards - Partnerships - Performance guarantees

If sample content is necessary, clearly treat it as sample/demo content.

Avoid unsupported claims such as: "guaranteed to increase revenue."

------------------------------------------------------------------------

## 11. Dependency Rules

Before adding a dependency: 1. Check whether the existing stack already
solves the problem. 2. Check whether a small local utility is
sufficient. 3. Add a dependency only when it provides meaningful value.

Do not add multiple libraries for the same purpose.

------------------------------------------------------------------------

## 12. File/Code Organization

Follow the existing project structure.

Do not create duplicate: - utility files - API clients - button
components - modal components - authentication helpers

If a suitable implementation already exists, reuse it.

------------------------------------------------------------------------

## 13. Testing Rules

For meaningful functionality: - Test happy path. - Test invalid input. -
Test permission boundaries. - Test important edge cases.

Before marking a phase complete:

``` text
lint
typecheck
test
build
```

must pass where those scripts exist.

------------------------------------------------------------------------

## 14. Change Management

Before large changes, provide a short plan.

After implementation, report: - Files changed - What changed -
Tests/checks run - Any known limitations - Any next-step recommendations

Do not claim something was tested if it was not tested.

------------------------------------------------------------------------

## 15. Error Handling

Errors must be actionable.

Bad:

``` text
Something went wrong.
```

Better:

``` text
Unable to load menu. Please try again.
```

Developer logs may contain technical details, but user-facing errors
should remain safe and understandable.

------------------------------------------------------------------------

## 16. Data Integrity

Never overwrite historical order information using current menu values.

When orders are implemented: - Store item name snapshots. - Store price
snapshots. - Store relevant variant/add-on snapshots.

Historical orders must remain understandable even after menu changes.

------------------------------------------------------------------------

## 17. Multi-Tenant Isolation

This is a critical rule.

A restaurant user must never be able to access another restaurant's: -
Menu - Orders - Customers - Tables - QR codes - Reports - Staff -
Settings

The server must enforce this.

Do not rely on frontend filtering for security.

------------------------------------------------------------------------

## 18. QR Rules

QR codes should identify a table through a secure token.

Do not encode the entire menu into the QR code.

Recommended flow:

``` text
QR
↓
Secure token
↓
Backend lookup
↓
Restaurant + table
↓
Current menu
```

Regenerating a QR token should invalidate the old token when that
behavior is intentionally requested.

------------------------------------------------------------------------

## 19. Order Rules

When implemented, order status transitions must be controlled.

Recommended initial statuses:

``` text
PENDING
ACCEPTED
PREPARING
READY
SERVED
COMPLETED
CANCELLED
REJECTED
```

The backend should validate allowed transitions.

Do not allow arbitrary clients to change an order to any status.

------------------------------------------------------------------------

## 20. Real-Time Rules

When real-time order updates are introduced: - Authenticate private
channels. - Scope events to the correct restaurant. - Never broadcast
private restaurant data globally. - Handle reconnects. - Do not assume a
socket connection is permanent.

------------------------------------------------------------------------

## 21. AI Behavior Rules

When an AI agent is uncertain: - Inspect the codebase. - Search existing
documentation. - Prefer explicit requirements over assumptions. - Ask
for clarification when a decision materially affects architecture. - Do
not silently invent requirements.

AI must not rewrite unrelated code merely to improve style.

------------------------------------------------------------------------

## 22. No Overengineering

Do not build future complexity before it is needed.

Examples: - Do not add microservices for an MVP. - Do not add event
buses before there is a real event requirement. - Do not build a mobile
app before the web workflow works. - Do not add AI features just because
the product is using AI agents for development.

Prefer a modular monolith initially.

------------------------------------------------------------------------

## 23. Definition of Done

A task is complete only when: - Requirements are implemented. - UI is
responsive where applicable. - Errors are handled. - Code is typed. -
Existing functionality still works. - Required checks pass. -
Documentation is updated when architecture changes.

------------------------------------------------------------------------

## 24. Priority Order

When requirements conflict, prioritize:

1.  Security
2.  Data integrity
3.  Correctness
4.  User experience
5.  Accessibility
6.  Maintainability
7.  Performance
8.  Visual polish

------------------------------------------------------------------------

## 25. Phase 1 Agent Instruction

For the first task, the AI agent should:

1.  Inspect the repository.
2.  Read `PRD.md`.
3.  Read `design.md`.
4.  Read `AI_RULES.md`.
5.  Create/confirm the project foundation.
6.  Implement only the Phase 1 landing page.
7.  Build reusable components.
8.  Implement responsive behavior.
9.  Implement accessibility basics.
10. Run lint/typecheck/build.
11. Fix errors.
12. Report exactly what was completed.

Do not start Phase 2 automatically.
