"use client";

import { useEffect } from "react";
import { logClientError } from "@/src/lib/client-error";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logClientError(error, `digest:${error.digest ?? "none"}`);
  }, [error]);

  return (
    <main className="workspace-shell">
      <section className="error-state">
        <div>
          <span className="eyebrow">Route error</span>
          <h1>Something went wrong.</h1>
          <p>{error.message}</p>
        </div>
        <div className="row-actions">
          <button type="button" onClick={reset}>
            Try Again
          </button>
          <button type="button" className="secondary" onClick={() => window.location.assign("/")}>
            Home
          </button>
        </div>
      </section>
    </main>
  );
}
