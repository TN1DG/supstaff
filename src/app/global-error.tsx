"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary: catches failures in the root layout itself, which the
 * route-level `(app)/error.tsx` cannot reach. It replaces the whole document,
 * so it must render its own <html>/<body> and cannot rely on app styles.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[supstaff] global error:", error);
  }, [error]);

  return (
    <html lang="en-GB">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "2rem",
          background: "#f7f6f1",
          color: "#2b322c",
          font: "16px/1.5 system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        <main style={{ maxWidth: "32rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", margin: "0 0 0.5rem" }}>
            Supstaff is temporarily unavailable
          </h1>
          <p style={{ margin: "0 0 1.5rem", color: "#5c6b60" }}>
            Something went wrong loading the app. Your work has not been lost.
          </p>
          <button
            onClick={reset}
            style={{
              border: "1px solid #c9d3c6",
              background: "#6b9b7c",
              color: "#fff",
              borderRadius: "0.5rem",
              padding: "0.5rem 1rem",
              font: "inherit",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest ? (
            <p
              style={{
                marginTop: "1.5rem",
                fontSize: "0.75rem",
                fontFamily: "ui-monospace, monospace",
                color: "#8a968c",
              }}
            >
              Reference: {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
