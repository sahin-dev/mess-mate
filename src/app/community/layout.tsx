import type { Metadata } from "next";
import Link from "next/link";
import { CookingPot } from "lucide-react";

/**
 * The public face of MessMate.
 *
 * Everything else in the app is behind a sign-in and marked `noindex`; this
 * branch is deliberately the opposite, so it carries its own chrome and its own
 * robots directives rather than inheriting the private ones.
 */
export const metadata: Metadata = {
  robots: { index: true, follow: true },
};

export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="public-shell">
      <header className="public-header">
        <Link className="public-brand" href="/community">
          <span className="brand-mark" aria-hidden="true">
            <CookingPot size={20} />
          </span>
          <span>
            <strong>MessMate</strong>
            <small>Rooms in shared homes</small>
          </span>
        </Link>
        <nav className="public-nav">
          <Link href="/community">Browse rooms</Link>
          <Link className="button button-dark button-tiny" href="/signin">
            Run your own mess
          </Link>
        </nav>
      </header>

      <main id="main-content">{children}</main>

      <footer className="public-footer">
        <p>
          &copy; {new Date().getFullYear()} MessMate &middot; Listings are published by the people
          who run each house. Always visit before paying anything.
        </p>
      </footer>
    </div>
  );
}
