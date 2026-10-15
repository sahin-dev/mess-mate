# MessMate UI/UX and production-readiness review

**Scope:** source-level heuristic review of the current application, with the
user/task inventory in `ui-ux-feature-checklist.md` and navigation, tab-keyboard,
and meal-draft improvements implemented. This is not a substitute for observing
residents and managers use the product or for testing it with assistive
technology.

## What is working well

- The product has a coherent visual system: shared color and type tokens,
  light/dark themes, consistent surfaces, keyboard focus styling, and reduced
  motion support.
- Core household jobs have clear destinations: meal entry, bazar review,
  shared expenses, personal money, and month reports. The dashboard brings
  forward setup tasks, pending work, and the member's settlement position.
- Important financial states are explained in the interface. Pending entries,
  month close/reopen, and settlement status are surfaced close to the related
  actions.
- Route loading, not-found, and recoverable error states exist. The app also
  includes a health endpoint and role-aware navigation.
- Mobile users get a compact bottom bar for frequent tasks, safe-area spacing,
  and a navigation drawer for less frequent destinations.

## Findings and changes

| Priority | Finding | Change or recommendation |
| --- | --- | --- |
| High | The closed mobile drawer was translated offscreen but its links remained in the keyboard tab order. Opening it did not move focus, contain keyboard focus, or stop the page behind it from scrolling. | Fixed in `workspace-shell.tsx`, `admin-portal.tsx`, and `globals.css`: closed drawers are hidden from interaction; opening moves focus into the drawer, traps Tab navigation, supports Escape, locks background scrolling, and restores focus to the opener. |
| Medium | Review indicators were visual badges only. Screen-reader users could reach a section without hearing that it had pending work. | Workspace and admin navigation now announce badge counts with descriptions of the work awaiting attention. |
| Medium | Settings and listing-moderation controls exposed ARIA tabs, but relied on pointer/Tab navigation instead of the expected arrow-key pattern. | Both tab sets now use roving focus and Left/Right Arrow plus Home/End navigation. The selected tab and visible content move together. |
| High | Meal edits existed only in component state, so refreshing or navigating away could silently lose unsaved counts. Saving several days in one action also reused a stale snapshot when clearing saved rows. | Drafts now recover per house, account, month, and selected member in the current browser tab. The page identifies restored edits and lets the user discard them; successful saves remove only their own day from the draft state. |
| Medium | A first-time manager can face several setup tasks at once. | The dashboard already offers a setup checklist and prioritized review inbox. Validate their ordering and language with new managers before adding another onboarding layer. |
| Medium | The review is based on source inspection, so responsive layout, contrast, touch targets, and screen-reader announcements have not been observed in a running browser. | Do a viewport review at phone, tablet, and desktop widths; keyboard-only walkthrough; and screen-reader pass for member and manager roles. Include the month-close and approval flows. |
| Low | The app contains many feature areas, which increases the cost of finding less frequent actions. | Keep the existing Quick add and keyboard shortcut discoverable, and measure which actions residents use before expanding the navigation. |

## Suggested acceptance checks

1. A keyboard user can open the mobile navigation, reach every drawer action,
   cycle focus without entering the page behind it, close with Escape, and
   resume at the opening control.
2. Pending meal, bazar, and join-request counts are announced with a useful
   description on mobile and desktop navigation.
3. Reloading the meal page with unsaved edits restores the current member/month
   draft and clearly explains that saving is still required.
4. Saving several meal days clears each completed day without restoring any
   previously saved rows to the unsaved list.
5. A new manager can set up a house, invite a member, record meals and bazar,
   review approvals, and close a month without needing documentation to
   understand what to do next.
6. Member and manager views explain why an amount is pending, frozen, owed, or
   owed to them, and offer a direct path to resolve the state.
7. Responsive and accessibility checks cover empty data, long names, large
   text, keyboard focus, reduced motion, and light/dark themes.

## Production-readiness notes

The codebase already has role-aware screens, error/loading fallbacks, a health
endpoint, and financial review/closure states. The wider engineering review is
tracked in [`engineering-hardening-checklist.md`](./engineering-hardening-checklist.md).
It has reviewed the source-level security and deployment boundaries and fixed
request-body buffering, private-avatar caching, and unbounded rate-limit-map
growth. Database recovery, live concurrency behavior, deployment proxy
configuration, external email delivery, and operational monitoring still need
environment-backed verification before release.
