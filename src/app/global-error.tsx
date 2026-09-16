"use client";

/**
 * Catches failures in the root layout itself, so it has to render its own
 * `<html>` and cannot rely on the app stylesheet being applied.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeContent: "center",
          gap: "12px",
          justifyItems: "center",
          padding: "24px",
          textAlign: "center",
          background: "#f5f7f4",
          color: "#172621",
          font: "16px/1.5 'Segoe UI', system-ui, sans-serif",
        }}
      >
        <h1 style={{ margin: 0, font: "600 26px/1.2 Georgia, serif" }}>MessMate is unavailable</h1>
        <p style={{ margin: 0, color: "#5f6d67", maxWidth: "42ch" }}>
          The application failed to start. Please try again in a moment.
        </p>
        {error.digest && (
          <code style={{ fontSize: "13px", color: "#75837c" }}>Reference: {error.digest}</code>
        )}
        <button
          onClick={retry}
          style={{
            marginTop: "8px",
            minHeight: "44px",
            padding: "0 20px",
            border: 0,
            borderRadius: "10px",
            background: "#173f32",
            color: "white",
            font: "600 15px 'Segoe UI', system-ui, sans-serif",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
