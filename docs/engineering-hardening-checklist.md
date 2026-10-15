# Engineering hardening checklist

This checklist tracks the repository review requested for the current pass.
Priorities reflect user impact and likelihood from source inspection. A checked
item has an implemented change and a verification result; it does not imply a
live production environment was exercised.

## Product and feature coverage

- [x] Map the product roles, routes, API endpoints, and principal workflows in
  [`ui-ux-feature-checklist.md`](./ui-ux-feature-checklist.md).
- [x] Establish a clean baseline with the repository's full production check.
- [x] Inspect authentication, authorization, session handling, API input
  boundaries, media access, throttling, database indexes, deployment headers,
  email, cron, and health behavior.
- [ ] Exercise account, household, finance, moderation, and admin workflows
  against a disposable database. No database was touched in this pass.
- [ ] Exercise member and manager journeys in a browser, including mobile,
  keyboard, and assistive technology. Browser discovery returned no available
  browser in this session.

## Prioritized hardening

### P1 — prevent oversized chunked request bodies from exhausting memory

- [x] `readJsonBody()` checked the declared content length and then called
  `request.text()`, which buffered the entire body before enforcing its cap.
- [x] Enforce the configured byte limit while consuming the request stream and
  cancel the stream once it exceeds the limit.
- [x] Verify with `pnpm run check` and `git diff --check`.

### P1 — apply avatar visibility changes promptly

- [x] Non-public avatar responses used `private, max-age=86400`, allowing a
  browser to keep showing a cached image after privacy or membership access
  changed.
- [x] Set non-public avatar responses to `private, no-store`; public avatars
  keep their existing short shared-cache behavior.
- [x] Verify with `pnpm run check` and `git diff --check`.

### P2 — bound in-process rate-limit memory

- [x] Public and per-user throttles could create a new map key per caller, with
  no upper bound until expiry and the periodic sweep.
- [x] Cap the map and evict the least recently used bucket when at capacity.
- [x] Verify with `pnpm run check` and `git diff --check`.
- [ ] For horizontally scaled or frequently recycled production instances,
  replace process-local counters with a shared rate-limit store. The current
  limiter remains per-process by design.

## Verification record

- Baseline `pnpm run check`: passed (TypeScript, ESLint, Next.js production
  build; routes included in build output).
- Post-change `pnpm run check`: passed (TypeScript, ESLint, Next.js production
  build; all app and API routes appear in the build output).
- `git diff --check`: passed.
- Automated unit or browser test suite: none is configured in `package.json`.
  The production check is available; a live browser and disposable database
  workflow were not available for this pass.

## Remaining review items

- [ ] Review close-month and concurrent financial mutation behavior against a
  real MongoDB deployment, especially transaction support and write races.
  Current source uses a separate open-month read before a record write. Making
  that atomic may require MongoDB transactions, so verify replica-set support
  for the intended deployment before changing the write path.
- [ ] Confirm rate-limit topology and proxy IP behavior in the intended hosting
  environment before launch.
- [ ] Run backup restore, email delivery, scheduled reminder, and monitoring
  checks with deployment credentials and services.
