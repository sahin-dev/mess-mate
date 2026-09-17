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
pnpm run clean:test-houses   # list houses left by end-to-end runs (add -- --delete to remove)
```

## Configuration

Every variable is documented in [`.env.example`](.env.example). Only
`MONGODB_URI` is required.

| Variable                   | Purpose                                                     |
| -------------------------- | ----------------------------------------------------------- |
| `MONGODB_URI`              | Connection string. Required.                                 |
| `MONGODB_DB`               | Database name. Defaults to `messmate`.                       |
| `MESSMATE_ENABLE_DEMO`     | Demo sign-in. Off in production unless set to `true`.        |
| `MESSMATE_APP_URL`         | Base URL used for links inside emails.                       |
| `MESSMATE_MAIL_FROM`       | From address for outbound email.                             |
| `RESEND_API_KEY`           | Use Resend's HTTP API for delivery.                          |
| `SMTP_HOST` and friends    | Use any SMTP server instead. See `.env.example`.             |
| `MESSMATE_CRON_SECRET`     | Bearer token protecting the reminder endpoint.               |
| `MESSMATE_TRUSTED_ORIGINS` | Extra origins allowed to POST, e.g. a preview domain.        |
| `MESSMATE_DEV_ORIGINS`     | Extra origins allowed to load dev assets (development).      |

## Routes

Pages are real URLs, so the back button, refresh and shared links all work.
`?month=YYYY-MM` on any workspace page selects the settlement month.

Only `/` and `/community` are public; `robots.txt` disallows everything else and
the rest of the app is served `noindex`.

| Path                     | Who                                              |
| ------------------------ | ------------------------------------------------ |
| `/`                      | **Public.** Landing page. Signed-in visitors are redirected to their mess |
| `/signin`                | Signed out                                       |
| `/join`                  | Signed in without a mess: search rooms, enter a code, or start a house |
| `/reset`                 | Password reset, reached from the emailed link    |
| `/dashboard`             | Overview: rate, your position, who pays whom     |
| `/meals`                 | Your own meal entries for the month              |
| `/bazar`                 | Grocery ledger, receipts and the duty roster     |
| `/expenses`              | Shared bills and the full settlement             |
| `/house`                 | Building & flat, rooms, facilities, listings     |
| `/members`               | Members and balances                             |
| `/settings`              | Managers only                                    |
| `/admin`                 | Platform administrators only                     |
| `/community`             | **Public.** Rooms to let, no sign-in needed      |
| `/community/[slug]`      | **Public.** One room, with the real monthly cost |

### API

| Endpoint          | Purpose                                                        |
| ----------------- | -------------------------------------------------------------- |
| `/api/auth`       | Session restore, sign up, sign in, demo, sign out               |
| `/api/workspace`  | Month-scoped reads and every validated mutation                 |
| `/api/proof`      | Streams a bazar receipt to members of that mess only            |
| `/api/admin`      | Platform aggregates. Administrators only                        |
| `/api/health`     | Liveness and database reachability, for uptime checks           |
| `/api/cron/notifications` | Scheduled reminders. Bearer token, run hourly           |
| `/api/geocode`    | Address search for the map picker, proxied to Nominatim          |

## The landing page

`/` is the public front door: what the product does, how the meal rate works,
and a live sample of rooms currently to let. It is server rendered with no
client JavaScript of its own, so it is fast and fully indexable. Anyone already
signed in is redirected straight to `/dashboard`, or to `/join` if they have not
set up a mess yet.

## The house

Everything above the room level lives under **House**, in four tabs:

- **Building & flat** — address, floor, flat number, lift, parking (including how
  a resident actually gets a space and what it costs), and a map pin.
- **Rooms** — rent and capacity, plus what each room has: attached bathroom,
  balcony, air conditioning, furnishing and free-text notes.
- **Facilities** — shared equipment and services, from a starter list (fridge,
  water filter, gas, Wi-Fi, geyser, generator, cleaner, and so on) that a manager
  can tick, annotate and extend.
- **Community** — managers only. Advertising a room to the public.

The map picker uses Leaflet with OpenStreetMap tiles, so it needs no API key and
no billing account. Address search is proxied through `/api/geocode` rather than
called from the browser, which keeps Nominatim's usage policy satisfied and the
content security policy free of third-party `connect-src` entries.

## Membership

Nobody is tied to a house. An account can hold a membership, ask for one, or
hold none at all, and where sign-in lands depends on which:

- **No mess** &rarr; `/join`, the room finder. Search published rooms by area,
  enter a join code, or start a house.
- **A mess** &rarr; `/dashboard`, that house's overview.

### Joining

Entering a join code raises a **request**; it does not grant access. The
manager sees it at the top of `/members` and either accepts or rejects it.
Accepting can assign a room in the same dialog. Until then the requester waits
on `/join`, and may cancel.

An **invitation** is the opposite direction, so it needs no second approval: a
person who signs in against an invited row joins immediately, and their
membership id is re-keyed to their account id.

> That re-keying matters. `computeSettlement()` attributes meals by
> `member.id`, so for any account-backed membership `member.id` must equal
> `user.id` &mdash; otherwise meals are recorded against a row nobody owns and
> silently vanish from the rate.

### Leaving

Any member can leave from `/members`. Two things block it: the owner cannot
leave their own house, and unsettled bazar must be resolved first, so a
departure cannot erase money the house still owes.

## Recording for someone else

A manager can record meals and bazar on behalf of any active member — for
someone travelling, or who simply does not use the app.

- **Meals** — a "Recording for" picker above the table. The page changes colour
  and says whose sheet is being edited while it is not your own.
- **Bazar** — a "Who bought this?" field, so the right person is credited.

Both are enforced on the server: a member who calls the API directly with
someone else's id is silently pinned to their own entries, and every edit made on
someone's behalf is written to the activity log with both names.

## Community: to-let posts

A room with a free space is advertised as a **post**, written in the poster's
own words rather than assembled from fields. **Publishing is an explicit,
per-room opt-in**, and the dialog says plainly what becomes public before the
switch is turned on.

### Who can write one

| Who | Can write about | Goes public |
| --- | --- | --- |
| Manager | any room with a free space | immediately |
| Member  | the room they live in | after the manager approves it |

A member's post is saved as `pending` and appears at the top of the Community
tab for the manager, who publishes it or sends it back as a draft. The reason
for that extra step is not tidiness: publishing exposes the house's real monthly
costs, which is the whole house's business, not one housemate's. A member can
edit and delete their own post, and nobody else's.

### What a post carries

- a **headline** and a body, shown with the author's name and whether they run
  the house or live in it;
- up to **8 photos**, resized to 1600px in the browser before upload so a phone
  photo does not become a 12 MB request. They are stored in their own
  collection, not inside the listing, and served from `/photo/<id>` — outside
  `/api`, because everything under there is blanket `no-store` for the private
  workspace and a photo on a published post is meant to be cached. A photo on an
  unpublished post is released only to that mess;
- **who the room would suit** — occupation, gender, smoking, food, household and
  religion, plus free text. Every one is optional, none of them filters search
  results, and anything left on "no preference" is not mentioned on the post at
  all. These fields exist because shared-accommodation adverts in Bangladesh
  routinely state them; note that advertising housing by religion is restricted
  in some other jurisdictions, so this is worth revisiting before launching
  outside that market;
- **house rules**, written as sentences, with suggestions to start from ("Lights
  off by midnight — the room is shared."). The examples deliberately say what
  *and* why, because a rule with a reason reads as fair rather than fussy.

A published post is a public, indexable web page showing all of the above plus:

- the room and what it has, the building, the parking arrangement, the
  facilities, the map pin, and the poster's chosen contact details;
- **what living there actually costs** — rent, plus food at the house's real
  meal rate, plus the real share of utilities, taken from the most recent
  *completed* month in that house's own records. The month in progress is
  skipped, because half a month of bazar makes a house look cheaper than it is.
  A house with no completed month shows the rent alone rather than a guess.

Member names, email addresses and individual balances are never included in the
public payload &mdash; the poster's own display name and the contact details
they typed in are the only personal information on the page. Taking a listing down purges the cached pages immediately,
though search engines may keep a copy for a while, which is outside the app's
control.

### Finding a room

`/community` and the signed-in finder at `/join` share one search component, so
both behave identically. A free-text box matches the house name, area, city and
address line; the popular-area chips are generated from what is actually
published, not a fixed list; and the collapsed filter panel narrows by rent,
seats, attached bathroom, balcony and air conditioning. Every filter lives in
the query string, so a search can be bookmarked and shared.

`/` and `/community` (with its listing pages) are the only parts of the app
`robots.txt` allows; everything else stays `noindex`.

## Time and timezones

Each mess carries its own IANA timezone, set under **Settings → Meals**. It is
the single source of truth for:

- which calendar day counts as "today",
- when the daily meal cutoff bites,
- which month the app opens on,
- when reminders are sent.

A house in Dhaka closes entry at 22:30 Dhaka time whether the server runs in
Frankfurt or Virginia, and the same rule is enforced on the server, not only
hidden in the UI. The `TZ` variable now only affects log timestamps.

## Email

MessMate sends four things: mess invitations, password resets, meal-cutoff
reminders and monthly settlement summaries.

Pick a transport in `.env`:

| Transport | When it is used                                  |
| --------- | ------------------------------------------------ |
| `console` | Default outside production. Prints to the log.   |
| `resend`  | When `RESEND_API_KEY` is set. HTTP, no SMTP.     |
| `smtp`    | When `SMTP_HOST` is set. Any SMTP server.        |
| `disabled`| Default in production until one of these is set. |

The app never claims to have sent something it could not: the invite dialog and
the notification settings both change their wording when no transport is
configured.

### Scheduled reminders

Point an hourly scheduler at the reminder endpoint:

```bash
curl -X POST https://your-host/api/cron/notifications      -H "Authorization: Bearer $MESSMATE_CRON_SECRET"
```

Each mess is evaluated in its own timezone, and each reminder is claimed once
per member per day, so running the job more often than hourly — or retrying a
failed run — sends nothing extra.

- **Cutoff reminder** goes out in the hour before the cutoff, only to members
  who have recorded nothing that day.
- **Bazar duty reminder** goes to whoever is on duty, the day before.
- **Settlement summary** goes to everyone on the first of the month, with the
  closing figures for the month just ended.

## Security

- Sessions are random 256-bit tokens stored in MongoDB with a TTL index, sent in
  an `HttpOnly`, `SameSite=Lax` cookie, `Secure` in production.
- Passwords use `scrypt` with a per-user salt, compared in constant time. A
  sign-in for an unknown email does the same work as a real one, so response
  time does not reveal whether an account exists.
- Every mutation re-checks the session, the membership and the role on the
  server. Hiding a button is never the only control.
- `POST` requests are rejected if they carry a foreign `Origin`.
- Password resets use a single-use token; only its SHA-256 hash is stored, it
  expires in 45 minutes, and using it signs out every other device. Asking for a
  reset answers identically whether or not the account exists.
- Sign-in, sign-up, resets and demo access are rate limited per caller. The limiter is
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

- Bazar receipts are stored inline with the entry and capped at 2 MB. Object
  storage would suit a large deployment better.
- A member belongs to one mess at a time.
- "Online now" on the admin dashboard counts accounts whose open tab reported in
  within the last two minutes. It needs JavaScript, it counts an account rather
  than a person (two of your own tabs are one), and it only began counting when
  the feature shipped — so the dashboard says its own figures are incomplete
  until every account has been seen at least once.
- Email is sent inline after the response rather than through a queue, so a
  provider outage drops that message instead of retrying it.
- Photos are stored as base64 in MongoDB, capped at 8 per post and ~1.5 MB
  each after the browser resizes them. Object storage would suit a large
  deployment better.
- There is no platform-wide moderation queue. A manager's post goes live
  immediately and nothing is verified by MessMate; the public pages say so. A
  member's post is checked by their own manager, but by nobody else.
- Address search depends on the public Nominatim service, which is rate limited
  and can be slow; the map always allows dropping a pin by hand instead.
- Browser extensions that rewrite credential inputs (password managers, throwaway
  email tools) used to trip React's hydration warning on the sign-in form. Those
  inputs now carry `suppressHydrationWarning`, which is the documented remedy;
  it does not mask mismatches anywhere else.
