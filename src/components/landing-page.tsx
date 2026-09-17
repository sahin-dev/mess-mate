import Link from "next/link";
import {
  ArrowRight,
  Bath,
  Bell,
  Building2,
  Check,
  ChevronRight,
  Clock3,
  CookingPot,
  Globe,
  Handshake,
  MapPin,
  Receipt,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  Users,
  Utensils,
} from "lucide-react";
import { formatMoney, pluralize } from "@/lib/format";
import type { PublicListingCard } from "@/lib/public-listings";

/**
 * The public front door.
 *
 * Server rendered with no client JavaScript of its own, so it is fast, works
 * without scripting and is fully indexable. The live listings below are real
 * rows from the database rather than decoration.
 */
export function LandingPage({
  listings,
  totalListings,
}: {
  /** The teaser sample, at most six. */
  listings: PublicListingCard[];
  /** Every published room, which is what the copy quotes. */
  totalListings: number;
}) {
  return (
    <div className="landing">
      <LandingHeader />
      <main id="main-content">
        <Hero total={totalListings} />
        <RateExplainer />
        <HowItWorks />
        <Features />
        {listings.length > 0 && <CommunityTeaser listings={listings} total={totalListings} />}
        <Faq />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}

function LandingHeader() {
  return (
    <header className="landing-header">
      <Link className="public-brand" href="/">
        <span className="brand-mark" aria-hidden="true">
          <CookingPot size={20} />
        </span>
        <span>
          <strong>MessMate</strong>
          <small>Shared living, sorted.</small>
        </span>
      </Link>
      <nav className="landing-nav">
        <Link href="#how">How it works</Link>
        <Link href="/community">Rooms to let</Link>
        <Link href="/signin">Sign in</Link>
        <Link className="button button-dark" href="/signin">
          Start free
        </Link>
      </nav>
    </header>
  );
}

function Hero({ total }: { total: number }) {
  return (
    <section className="landing-hero">
      <div className="landing-hero-copy">
        <span className="landing-eyebrow">
          <Sparkles size={13} aria-hidden="true" /> BUILT FOR SHARED HOMES
        </span>
        <h1>
          Nobody should lose an evening
          <br />
          to a <em>meal-rate spreadsheet.</em>
        </h1>
        <p>
          MessMate keeps every meal, bazar run and bill in one place, then works out exactly who
          owes whom at the end of the month. No formulas, no arguments, no lost receipts.
        </p>
        <div className="landing-cta">
          <Link className="button button-coral button-lg" href="/signin">
            Start your mess free <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <Link className="button button-outline button-lg" href="/community">
            {total > 0 ? `Browse ${pluralize(total, "room")} to let` : "Browse rooms to let"}
          </Link>
        </div>
        <ul className="landing-assurances">
          <li>
            <Check size={14} aria-hidden="true" /> Free to use
          </li>
          <li>
            <Check size={14} aria-hidden="true" /> No card needed
          </li>
          <li>
            <Check size={14} aria-hidden="true" /> Works on any phone
          </li>
        </ul>
      </div>

      <div className="landing-hero-visual" aria-hidden="true">
        <div className="hero-card hero-card-main">
          <div className="hero-card-top">
            <span>
              <CookingPot size={15} /> Shapla House
            </span>
            <span className="hero-pill">September</span>
          </div>
          <div className="hero-bars">
            {[38, 52, 44, 61, 48, 70, 58, 66].map((height, index) => (
              <span key={index} style={{ height: `${height}%` }} className={index === 7 ? "on" : ""} />
            ))}
          </div>
          <p className="hero-label">Meal rate this month</p>
          <strong className="hero-rate">&#2547;64.20</strong>
          <p className="hero-sub">&#2547;18,400 bazar &divide; 287 meals</p>
        </div>

        <div className="hero-card hero-card-settle">
          <div className="hero-card-top">
            <span>
              <Handshake size={15} /> To close the month
            </span>
          </div>
          <ul>
            {[
              ["Ayon", "you", 2180],
              ["Nayeem", "you", 1645],
              ["Tahmid", "you", 970],
            ].map(([from, to, amount]) => (
              <li key={String(from)}>
                <span>
                  <b>{from}</b> <ArrowRight size={11} /> {to}
                </span>
                <b>{formatMoney(Number(amount))}</b>
              </li>
            ))}
          </ul>
        </div>

        <div className="hero-card hero-card-meal">
          <span className="hero-meal-icon">
            <Utensils size={15} />
          </span>
          <div>
            <strong>Today&rsquo;s meals saved</strong>
            <small>Closes at 22:30 &middot; Asia/Dhaka</small>
          </div>
          <Check size={16} className="hero-tick" />
        </div>
      </div>
    </section>
  );
}

function RateExplainer() {
  return (
    <section className="landing-rate">
      <div className="landing-section-head">
        <span className="landing-eyebrow">THE IDEA</span>
        <h2>One number settles the whole month.</h2>
        <p>
          Everything a mess argues about comes down to the meal rate. MessMate works it out from
          what you actually recorded, so it is never a guess and never a negotiation.
        </p>
      </div>

      <div className="rate-equation">
        <div className="rate-term">
          <span className="rate-icon coral">
            <ShoppingBasket size={20} aria-hidden="true" />
          </span>
          <strong>Approved bazar</strong>
          <small>Every grocery run the manager signed off</small>
        </div>
        <span className="rate-operator" aria-hidden="true">
          &divide;
        </span>
        <div className="rate-term">
          <span className="rate-icon sage">
            <Utensils size={20} aria-hidden="true" />
          </span>
          <strong>Everyone&rsquo;s meals</strong>
          <small>What each person actually ate</small>
        </div>
        <span className="rate-operator" aria-hidden="true">
          =
        </span>
        <div className="rate-term rate-result">
          <strong>The meal rate</strong>
          <small>Eat less, pay less. Automatically.</small>
        </div>
      </div>

      <p className="rate-footnote">
        Rent and bills are split separately &mdash; equally, or in proportion to what each person
        pays in rent. Balances always add up to zero, and MessMate reduces them to the shortest list
        of payments that clears the month.
      </p>
    </section>
  );
}

const STEPS = [
  {
    icon: Utensils,
    title: "Everyone records their meals",
    body: "Each person sets their own breakfast, lunch and dinner. Today closes at the cutoff you choose, in your own timezone. A manager can fill in for anyone who is away.",
  },
  {
    icon: ShoppingBasket,
    title: "Whoever shops adds the bazar",
    body: "Items, total and a receipt photo if you want one. A manager approves it, and it counts towards the food pot.",
  },
  {
    icon: Receipt,
    title: "Bills go in once",
    body: "Rent, electricity, gas, the cleaner. Split equally or by room rent, and credited to whoever actually paid.",
  },
  {
    icon: Handshake,
    title: "The month settles itself",
    body: "Everyone sees the same figures and the same short list of who pays whom. Export it as a spreadsheet if you like.",
  },
];

function HowItWorks() {
  return (
    <section className="landing-steps" id="how">
      <div className="landing-section-head">
        <span className="landing-eyebrow">HOW A MONTH WORKS</span>
        <h2>Four habits, and the maths disappears.</h2>
      </div>
      <ol className="step-grid">
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <span className="step-number">{index + 1}</span>
            <span className="step-icon" aria-hidden="true">
              <step.icon size={20} />
            </span>
            <strong>{step.title}</strong>
            <p>{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

const FEATURES = [
  {
    icon: Building2,
    title: "The whole house, written down",
    body: "Floor, flat number, lift, parking and how to get a space. Every room with its rent, attached bathroom, balcony and furnishing. The fridge, the filter, the generator.",
  },
  {
    icon: Clock3,
    title: "Your clock, not the server's",
    body: "Each mess sets its own timezone. A cutoff of 22:30 means 22:30 where you live, wherever the app happens to be running.",
  },
  {
    icon: Bell,
    title: "Reminders that are not noise",
    body: "A nudge before the cutoff, but only to people who have recorded nothing. A word to whoever is on bazar duty tomorrow. A summary when the month closes.",
  },
  {
    icon: Globe,
    title: "Let a room to the right person",
    body: "Advertise a free space with the real monthly cost, taken from your own records. People arrive knowing what it costs instead of asking.",
  },
  {
    icon: ShieldCheck,
    title: "Private by default",
    body: "Your ledger is yours. Nothing is public until you publish a room, and even then no member names, emails or balances ever leave the house.",
  },
  {
    icon: Users,
    title: "Fair to whoever travels",
    body: "Skip a week and you pay for a week less food. Nobody subsidises anybody, and nobody has to argue the point.",
  },
];

function Features() {
  return (
    <section className="landing-features">
      <div className="landing-section-head">
        <span className="landing-eyebrow">WHAT YOU GET</span>
        <h2>Everything a shared home actually argues about.</h2>
      </div>
      <ul className="feature-grid">
        {FEATURES.map((feature) => (
          <li key={feature.title}>
            <span className="feature-icon" aria-hidden="true">
              <feature.icon size={20} />
            </span>
            <strong>{feature.title}</strong>
            <p>{feature.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CommunityTeaser({
  listings,
  total,
}: {
  listings: PublicListingCard[];
  total: number;
}) {
  return (
    <section className="landing-community">
      <div className="landing-section-head">
        <span className="landing-eyebrow">ROOMS TO LET</span>
        <h2>Looking for a place instead?</h2>
        <p>
          Every listing shows what living there really costs &mdash; rent, food and bills &mdash;
          worked out from that house&rsquo;s own records.
        </p>
      </div>

      <ul className="teaser-grid">
        {listings.slice(0, 3).map((listing) => (
          <li key={listing.slug}>
            <Link className="listing-card" href={`/community/${listing.slug}`}>
              <div className="listing-card-head">
                <strong>{listing.messName}</strong>
                <span>
                  <MapPin size={13} aria-hidden="true" />
                  {[listing.area, listing.city].filter(Boolean).join(", ") || "Location not given"}
                </span>
              </div>
              <p className="listing-room">
                {listing.roomName} &middot; {pluralize(listing.seats, "person", "people")}
              </p>
              <ul className="listing-badges">
                {listing.attachedBathroom && (
                  <li>
                    <Bath size={12} aria-hidden="true" /> Attached bath
                  </li>
                )}
                {listing.balcony && <li>Balcony</li>}
                {listing.facilityCount > 0 && <li>{listing.facilityCount} facilities</li>}
              </ul>
              <div className="listing-card-foot">
                <div>
                  <strong>{formatMoney(listing.rentPerSeat)}</strong>
                  <small>rent per person</small>
                </div>
                <div className="listing-total">
                  <strong>{formatMoney(listing.estimatedMonthlyTotal)}</strong>
                  <small>all in, per month</small>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <Link className="landing-more" href="/community">
        See all {pluralize(total, "room")} <ChevronRight size={15} aria-hidden="true" />
      </Link>
    </section>
  );
}

const FAQ = [
  {
    q: "Is it really free?",
    a: "Yes. MessMate is free to run for your house, with no card and no per-member charge.",
  },
  {
    q: "What if someone will not use an app?",
    a: "A manager can record meals and bazar on their behalf. Everything stays correct, and every entry made for someone else is written to the activity log with both names.",
  },
  {
    q: "Do I have to advertise my room publicly?",
    a: "No. Listings are entirely optional and off by default. Your ledger stays private whether you publish or not, and taking a listing down removes it immediately.",
  },
  {
    q: "What happens to a month that has closed?",
    a: "Nothing changes it. You can open any past month from the picker and see exactly the figures everyone settled on, or export them as a spreadsheet.",
  },
  {
    q: "Can I get my data out?",
    a: "Every ledger, member balance and settlement exports to CSV, which opens in Excel and Google Sheets with the taka sign intact.",
  },
];

function Faq() {
  return (
    <section className="landing-faq">
      <div className="landing-section-head">
        <span className="landing-eyebrow">QUESTIONS</span>
        <h2>The things people ask first.</h2>
      </div>
      <div className="faq-list">
        {FAQ.map((item) => (
          <details key={item.q}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="landing-final">
      <div>
        <h2>Settle this month in minutes.</h2>
        <p>
          Set up your house, invite everyone, and let the rate do the arguing. It takes about five
          minutes to get going.
        </p>
      </div>
      <div className="landing-cta">
        <Link className="button button-coral button-lg" href="/signin">
          Create your mess <ArrowRight size={17} aria-hidden="true" />
        </Link>
        <Link className="button button-light button-lg" href="/community">
          Or find a room
        </Link>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="public-brand">
        <span className="brand-mark" aria-hidden="true">
          <CookingPot size={18} />
        </span>
        <span>
          <strong>MessMate</strong>
          <small>Shared living, sorted.</small>
        </span>
      </div>
      <nav>
        <Link href="/community">Rooms to let</Link>
        <Link href="/signin">Sign in</Link>
        <Link href="#how">How it works</Link>
      </nav>
      <p>&copy; {new Date().getFullYear()} MessMate</p>
    </footer>
  );
}
