"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // In production the message is redacted; the digest matches the server log.
    console.error("[messmate] route error", error);
  }, [error]);

  return (
    <main className="status-page">
      <span className="status-code">Oops</span>
      <h1>Something went wrong</h1>
      <p>
        We could not load this page. This is usually temporary &mdash; trying again often fixes it.
      </p>
      {error.digest && <code className="status-digest">Reference: {error.digest}</code>}
      <div className="status-actions">
        <button className="button button-dark" onClick={retry}>
          Try again
        </button>
        <Link className="button button-outline" href="/">
          Back to your mess
        </Link>
      </div>
    </main>
  );
}
