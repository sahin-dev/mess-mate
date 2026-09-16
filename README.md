# MessMate

MessMate keeps a shared home's meals, grocery runs and bills in one place, and
works out who owes whom at the end of the month.

Built with Next.js 16 route handlers, React 19 and MongoDB.

## How the numbers work

Every figure in the app is derived from what members actually record. Nothing is
hard-coded or estimated.

For a given month:

- **Meal rate** = approved bazar total ÷ every member's meals.
  A member who eats more pays more.
- **Bills** are split either equally between active members, or in proportion to
  each member's share of the rent ("By room").
- Whoever submitted a bazar entry, or was recorded as paying a bill, is credited
  with having paid it.
- **Balance** = what a member paid − (their meals × the rate) − their share of the
  bills. Positive means the mess owes them.

Balances always sum to zero, and the app reduces them to the shortest list of
payments that settles the month.

The maths lives in [`src/lib/settlement.ts`](src/lib/settlement.ts), separate from
the database and the UI.

## Setup

```bash
cp .env.example .env    # then set MONGODB_URI
pnpm install
pnpm run seed           # creates indexes
pnpm run dev
```

Open <http://localhost:3000>.

Outside production the sign-in page offers two demo accounts, which build a
worked example for the current month:

| Role     | Email                    | Password     |
| -------- | ------------------------ | ------------ |
| Manager  | `manager@messmate.local` | `demo12345`  |
| Platform | `admin@messmate.local`   | `admin12345` |

## Commands

```bash
pnpm run dev         # development server
pnpm run check       # typecheck, lint and production build
pnpm run build       # production build
pnpm run start       # serve the production build
pnpm run seed        # create database indexes
```

## Configuration

Every variable is documented in [`.env.example`](.env.example). Only
`MONGODB_URI` is required.

| Variable                   | Purpose                                                    |
| -------------------------- | ---------------------------------------------------------- |
| `MONGODB_URI`              | Connection string. Required.                                |
| `MONGODB_DB`               | Database name. Defaults to `messmate`.                      |
| `MESSMATE_ENABLE_DEMO`     | Demo sign-in. Off in production unless set to `true`.       |
| `MESSMATE_TRUSTED_ORIGINS` | Extra origins allowed to POST, e.g. a preview domain.       |
| `MESSMATE_DEV_ORIGINS`     | Extra origins allowed to load dev assets (development).     |
| `TZ`                       | Timezone used to evaluate meal cutoffs.                     |

## Routes

Pages are real URLs, so the back button, refresh and shared links all work.
`?month=YYYY-MM` on any workspace page selects the settlement month.

| Path                     | Who                                              |
| ------------------------ | ------------------------------------------------ |
| `/signin`, `/join`       | Signed out, or signed in without a mess          |
| `/`                      | Overview: rate, your position, who pays whom     |
| `/meals`                 | Your own meal entries for the month              |
| `/bazar`                 | Grocery ledger, receipts and the duty roster     |
| `/expenses`              | Shared bills and the full settlement             |
| `/rooms`, `/members`     | House setup and balances                         |
| `/settings`              | Managers only                                    |
| `/admin`                 | Platform administrators only                     |

### API

| Endpoint          | Purpose                                                        |
| ----------------- | -------------------------------------------------------------- |
| `/api/auth`       | Session restore, sign up, sign in, demo, sign out               |
| `/api/workspace`  | Month-scoped reads and every validated mutation                 |
| `/api/proof`      | Streams a bazar receipt to members of that mess only            |
| `/api/admin`      | Platform aggregates. Administrators only                        |
| `/api/health`     | Liveness and database reachability, for uptime checks           |

## Security

- Sessions are random 256-bit tokens stored in MongoDB with a TTL index, sent in
  an `HttpOnly`, `SameSite=Lax` cookie, `Secure` in production.
- Passwords use `scrypt` with a per-user salt, compared in constant time. A
  sign-in for an unknown email does the same work as a real one, so response
  time does not reveal whether an account exists.
- Every mutation re-checks the session, the membership and the role on the
  server. Hiding a button is never the only control.
- `POST` requests are rejected if they carry a foreign `Origin`.
- Sign-in, sign-up and demo access are rate limited per caller. The limiter is
  in process memory: behind more than one instance, move it to a shared store
  (see [`src/lib/rate-limit.ts`](src/lib/rate-limit.ts)).
- **Demo sign-in grants platform-administrator access**, so it is disabled in
  production unless `MESSMATE_ENABLE_DEMO=true`.
- Security headers, including a content security policy, are set in
  [`next.config.ts`](next.config.ts).

## Deploying

1. Set `MONGODB_URI`, and `TZ` for your members' timezone.
2. Leave `MESSMATE_ENABLE_DEMO` unset, so the demo buttons stay off.
3. Run `pnpm run seed` once against the production database.
4. `pnpm run build && pnpm run start`, behind TLS.
5. Point your uptime check at `/api/health`.

## Known limitations

- No email is sent. Invitations reserve a place; the join code is shared by hand.
- Notification preferences are stored but nothing is delivered yet.
- Meal cutoffs use the server's timezone rather than a per-mess one.
- Bazar receipts are stored inline with the entry and capped at 2 MB. Object
  storage would suit a large deployment better.
- A member belongs to one mess at a time.
