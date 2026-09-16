import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="status-page">
      <span className="status-code">404</span>
      <h1>We could not find that page</h1>
      <p>The link may be out of date, or the page may have moved.</p>
      <Link className="button button-dark" href="/">
        Back to your mess
      </Link>
    </main>
  );
}
