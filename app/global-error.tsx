"use client";

import { useEffect } from "react";
import { logClientError } from "@/src/lib/client-error";
import "./globals.css";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logClientError(error, `global-digest:${error.digest ?? "none"}`);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="workspace-shell">
          <section className="error-state">
            <div>
              <span className="eyebrow">Global error</span>
              <h1>Stock Analyser recovered from a fatal error.</h1>
              <p>{error.message}</p>
            </div>
            <button type="button" onClick={reset}>
              Try Again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
