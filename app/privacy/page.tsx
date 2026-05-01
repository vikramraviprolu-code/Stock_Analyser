import { DISCLAIMER } from "@/src/lib/legal";

const rights = [
  "Access and export your saved workspace data.",
  "Correct saved records by editing or replacing them in the app.",
  "Delete saved workspace data from this app instance.",
  "Use portable JSON export for watchlists, portfolio holdings, alerts, consent history, and audit events.",
  "Keep optional processing disabled unless you explicitly opt in."
];

export default function PrivacyPage() {
  return (
    <main id="main-content" className="workspace-shell legal-page">
      <span className="eyebrow">Privacy and security</span>
      <h1>Privacy Notice</h1>
      <p>{DISCLAIMER}</p>
      <section className="content-band">
        <h2>Data Stored By This App</h2>
        <p>
          This local build stores user-entered workspace data: watchlist tickers, portfolio holdings, alert rules,
          alert events, privacy consent preferences, consent history, and workspace audit events. It does not use
          advertising cookies or third-party analytics.
        </p>
      </section>
      <section className="content-band">
        <h2>Storage Security</h2>
        <p>
          Local workspace data is stored as encrypted JSON using AES-256-GCM. A local key file is created with
          owner-only permissions unless an environment secret is configured. Hosted sync still needs managed
          encryption, user authentication, and provider access controls before production use.
        </p>
      </section>
      <section className="content-band">
        <h2>Account Security</h2>
        <p>
          Local accounts use scrypt-hashed passphrases, encrypted account records, and httpOnly signed session cookies.
          Signed-in workspace requests are scoped to a local user id; anonymous use remains available for single-user
          local workflows.
        </p>
      </section>
      <section className="content-band">
        <h2>Purpose</h2>
        <p>
          Data is used only to provide the requested workspace features: saved watchlists, holdings, alerts,
          source-audited analysis, and future opt-in brief delivery.
        </p>
      </section>
      <section className="content-band">
        <h2>Your Controls</h2>
        <ul>
          {rights.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <section className="content-band">
        <h2>Cloud Readiness</h2>
        <p>
          Hosted sync must be enabled only with authenticated users, provider-managed encryption, row-level access
          control, secure secret rotation, and a data processing agreement with the chosen provider.
        </p>
      </section>
    </main>
  );
}
