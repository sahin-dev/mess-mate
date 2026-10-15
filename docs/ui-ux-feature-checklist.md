# MessMate feature and regression checklist

This inventory is based on the routes, README, visible controls, view
components, and API boundaries in the codebase. It is the regression checklist
for this UI/UX pass. A source review confirms a route/control exists; it does
not prove the live workflow works. Runtime checks are marked separately.

## Product and roles

- **Visitors:** learn what MessMate does, browse available rooms, contact a
  poster, and report a listing without signing in.
- **Members:** record their own meals and bazar, see shared costs and balances,
  manage a private money ledger, and manage their profile/membership.
- **Managers:** run household records, review entries and join requests, manage
  the property and rules, and close/reopen settlements.
- **Platform administrators:** operate accounts, messes, public listings,
  announcements, activity, audit history, and system health.

## Feature inventory

Status labels: **Mapped** means the source flow and its role/API boundary were
reviewed. **Live check** remains unchecked until exercised after this pass.

| Area / route | Existing job and important behavior | Source review | Live check |
| --- | --- | --- | --- |
| `/` Public landing | Explain shared-home accounting, show live public rooms, route signed-in users to the right workspace. | [x] Mapped | [ ] |
| `/signin` | Sign in, sign up, optional demo access outside production, preserve invite code through authentication. | [x] Mapped | [ ] |
| `/reset` | Request a password reset and set a new password from a single-use emailed link. | [x] Mapped | [ ] |
| `/join` room finder | Search published rooms; filters/search persist in the URL; use a join code or start a house. | [x] Mapped | [ ] |
| Join request lifecycle | Request access, wait for manager review, cancel request, or enter a workspace after approval. | [x] Mapped | [ ] |
| House creation | Create a mess with name, location, member count and join code; guide setup from the dashboard. | [x] Mapped | [ ] |
| `/community` | Public search, popular-area chips, rent/room/facility filters, query-string sharing. | [x] Mapped | [ ] |
| `/community/[slug]` | Public listing detail, gallery, room/property/facility details, real completed-month cost, chosen contact details, report action. | [x] Mapped | [ ] |
| Listing privacy/moderation | Explicit per-room publication; member posts await approval; photos and contact details follow visibility rules; visitor reports are throttled. | [x] Mapped | [ ] |
| Workspace navigation | Role-aware sidebar, mobile bottom bar/drawer, month-preserving links, pending counts, quick add, keyboard shortcut, help, sign-out. | [x] Mapped | [ ] |
| Workspace notices/activity | Dismissible announcements, unread activity, notification panel, manager notice board with pin/edit/delete. | [x] Mapped | [ ] |
| `/dashboard` | Month overview, member position, manager review inbox, setup checklist, next tasks, meal rate, meal entry, duty, notices, trends, transfers, recent activity. | [x] Mapped | [ ] |
| `/meals` member entries | Per-day breakfast/lunch/dinner stepper, cutoff/timezone rules, row and bulk save, current-week paging, CSV/PDF access. | [x] Mapped | [ ] |
| `/meals` manager review | Approve/reject pending member entries; record meals for another active member with attribution. | [x] Mapped | [ ] |
| Kitchen reconciliation | Record cooked/wasted portions; compare with approved/pending member meals; review unexplained or overclaimed portions; frozen on close. | [x] Mapped | [ ] |
| `/bazar` | Record/edit/delete grocery entries, purchaser, receipt proof, pending approval, bazar ledger and duty roster. | [x] Mapped | [ ] |
| `/expenses` bills | Add/edit/delete shared expenses, payer/date/category, equal or rent-weighted split, recurring-bill entry. | [x] Mapped | [ ] |
| `/expenses` settlement | Read member balances and transfers, mark settle-up paid, export ledger, close a reviewed month, reopen with reason. | [x] Mapped | [ ] |
| `/reports` | Monthly connected report for meals, bazar, kitchen log, bills, member shares and settlement; print/PDF and CSV. | [x] Mapped | [ ] |
| `/money` private ledger | Add/edit/delete income and personal expenses, filter/export, category budgets, automatic living-cost entries; private to account. | [x] Mapped | [ ] |
| `/house` Building & flat | Address, map pin, building/flat details, floor, lift and parking arrangements/cost. | [x] Mapped | [ ] |
| `/house/rooms` | Room rent/capacity/features/notes, assignments, and prevent capacity below occupancy. | [x] Mapped | [ ] |
| `/house/facilities` | Starter and custom shared facility/service checklist with notes. | [x] Mapped | [ ] |
| `/house/listings` | Create/edit/delete/publish/submit a room listing, photos, rules, suitability and public contact choices. | [x] Mapped | [ ] |
| `/members` | Search/filter roster, requests, invitation state/retry, accept/decline, assign room, role changes, removal, former members, leave mess, meal history. | [x] Mapped | [ ] |
| `/profile` | Update account details, avatar, password and listing visibility/contact preferences. | [x] Mapped | [ ] |
| `/settings` General | Join code, mess identity, timezone, transfer ownership and danger-zone lifecycle actions. | [x] Mapped | [ ] |
| `/settings` Meals | Meal types, cutoff, anytime edits, approval requirement, kitchen reconciliation settings. | [x] Mapped | [ ] |
| `/settings` Bazar rules | Approval and receipt requirements, duty schedule and related rules. | [x] Mapped | [ ] |
| `/settings` Fixed bills | Recurring bill rules, payer/split defaults and future open-month generation. | [x] Mapped | [ ] |
| `/settings` Notifications | Cutoff, duty and monthly summary reminder controls. | [x] Mapped | [ ] |
| `/admin` Overview | Live platform metrics, attention queue and deployment/configuration warnings. | [x] Mapped | [ ] |
| `/admin` Users | Search/filter/page accounts; inspect membership/history; reset password, revoke sessions, role, suspend/restore. | [x] Mapped | [ ] |
| `/admin` Messes | Search/page houses; inspect roster/counts/activity; suspend/restore. | [x] Mapped | [ ] |
| `/admin` Listings & reports | Review visitor reports and public posts; take down with reason, resolve or allow again. | [x] Mapped | [ ] |
| `/admin` Announcements | Create/edit/delete/end/schedule audience-specific banners and tones. | [x] Mapped | [ ] |
| `/admin` Workspace activity | Search/paginate/export platform-wide activity. | [x] Mapped | [ ] |
| `/admin` Audit log | Search/paginate/export administrator actions and reasons. | [x] Mapped | [ ] |
| `/admin` System health | Check environment configuration, database status/size/collections and runtime details. | [x] Mapped | [ ] |
| Shared states | Loading UI, empty states, validation/errors, confirmation dialogs, toasts, role-denied redirects, 404 and route/global error recovery. | [x] Mapped | [ ] |

## UI-connected integrations

- [x] `/api/auth`: account registration/sign-in, session restore, demo, sign-out,
  reset request and reset completion.
- [x] `/api/workspace`: month-scoped household/private-money reads and validated
  mutations; UI keeps permissions and server-calculated settlement contracts.
- [x] `/api/members/lookup`: manager-only exact-email invitation lookup.
- [x] `/api/proof` and `/photo/[id]`: private receipt access and listing-photo
  visibility based on listing state/membership.
- [x] `/api/report`: public listing-report form with throttling/repeat handling.
- [x] `/api/admin`: admin-only queries and audited platform actions.
- [x] `/api/geocode`: address suggestion for the property map picker, with
  manual-pin fallback.
- [x] `/api/presence`: workspace/admin online activity indicator.
- [x] `/api/cron/notifications`: configured email reminders and monthly summary.
- [x] `/api/health`, `robots.txt`, and sitemap: deployment status and indexing
  boundaries.

The API marks above confirm the UI integration and server boundary were mapped
from source. They do not claim the external mail provider, geocoder, database,
or scheduled job was exercised in this pass.

## Change impact and verification

Changes in this pass are limited to the workspace shell and meal entry:

- Workspace navigation: focus behavior, off-canvas visibility, scroll lock,
  Escape dismissal, return focus, and descriptive pending-count announcements.
- Settings and listing-moderation tabs: Left/Right Arrow and Home/End keyboard
  navigation with one active tab stop, matching the tab pattern already exposed
  to assistive technology.
- Platform-admin navigation: the same managed mobile drawer behavior and
  descriptive attention badges as the household workspace.
- Meal entry: recover unsaved drafts in the same tab, identify/discard recovered
  edits, and clear each successfully saved day without reintroducing saved days.

Required regression checks for changed flows:

- [x] `pnpm run check`: TypeScript, full-project ESLint, and production build.
- [x] `git diff --check`.
- [ ] Browser unavailable in this session (browser discovery returned no
  available browser). Open/close navigation by button, backdrop and Escape; cycle focus;
  verify focus returns to opener and background scrolling is locked.
- [ ] Browser unavailable: move between all settings and moderation tabs with keyboard,
  verify focus/selection/content stay in sync and settings drafts remain intact.
- [ ] Browser unavailable: restore meal drafts after refresh and client-side navigation;
  change month/member and confirm drafts remain correctly scoped.
- [ ] Browser unavailable: save multiple days, include a failed save, and verify only
  successful days clear while failed edits remain recoverable.
- [ ] Browser unavailable: viewport review at phone, tablet and desktop widths; member and
  manager roles; keyboard-only and screen-reader announcements.

Build output included the existing workspace, community, auth, and admin routes
plus the API routes. This proves they compile and are included in the production
build; it does not prove their live interaction paths.

Unchanged feature areas have no source edits: the diff is limited to shared
navigation components, shared UI accessibility, settings/admin tab interaction,
meal draft handling, and their styling/docs. Their routes/APIs compile in the
production build. The unchecked live checks above are not claimed as verified.
