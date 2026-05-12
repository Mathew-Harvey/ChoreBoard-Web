import {
  LegalLayout,
  PolicyCallout,
  PolicySection,
  PolicySummary,
} from './LegalLayout';

/**
 * In-app rendering of the Privacy Policy. Same content as the static
 * `/privacy.html` on the marketing site, rendered through the React shell so
 * a signed-in family can review it without leaving app.choreboard.io.
 *
 * If you change copy here, mirror it in
 * `../../../../ChoreBoard-Landing/privacy.html` so the two versions don't
 * drift.
 */
export function PrivacyPolicy() {
  return (
    <LegalLayout
      page="privacy"
      pageIndex={6}
      pageLabel="PRIVACY POLICY"
      pageTitle="Privacy Policy"
      effective="12 May 2026"
      contact={{ label: 'privacy@choreboard.io', href: 'mailto:privacy@choreboard.io' }}
      intro={
        <PolicySummary accent="money">
          <span>
            ChoreBoard stores the data you and your family enter so the app
            works. We don&apos;t sell it and we don&apos;t run advertising.
          </span>
          <span>
            Parents sign in with email + password. Kids sign in with a 4-digit
            PIN added by a parent. Both are stored as Argon2 hashes — we never
            see them in plain text.
          </span>
          <span>
            We use a small set of standard SaaS sub-processors for hosting,
            email, analytics, and crash reporting. They&apos;re listed in §5.
          </span>
          <span>
            You can export or delete your family&apos;s data any time. Email{' '}
            <a className="legal-link" href="mailto:privacy@choreboard.io">
              privacy@choreboard.io
            </a>
            .
          </span>
          <span>
            ChoreBoard is operated from Australia and complies with the
            Australian Privacy Principles under the Privacy Act 1988.
          </span>
        </PolicySummary>
      }
    >
      <PolicySection id="who" num={1} title="Who we are">
        <p>
          ChoreBoard (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is
          a family-dashboard SaaS operated from Australia. We provide a web app
          where parents and kids in a single household track and complete
          chores together, and a marketing site at{' '}
          <a className="legal-link" href="https://choreboard.io">
            choreboard.io
          </a>
          .
        </p>
        <p>
          For privacy questions or to exercise any of the rights described
          below, write to{' '}
          <a className="legal-link" href="mailto:privacy@choreboard.io">
            privacy@choreboard.io
          </a>
          .
        </p>
      </PolicySection>

      <PolicySection id="what" num={2} title="What we collect">
        <h3 className="legal-h3">From parents (account holders)</h3>
        <ul className="bul">
          <li>
            Email address, name, password (stored as an Argon2id hash, never
            plain text).
          </li>
          <li>Family name and timezone.</li>
          <li>
            Optional web-push subscription details (only if you install the PWA
            and opt in to notifications).
          </li>
          <li>Payout-day and payout-time preferences.</li>
        </ul>

        <h3 className="legal-h3">About kids in the family (entered by a parent)</h3>
        <ul className="bul">
          <li>
            Display name, avatar, colour, and a 4-digit PIN (stored as an
            Argon2id hash).
          </li>
          <li>Optional personal goal name and target amount.</li>
        </ul>
        <p>
          Kids do not have an email address on file, do not receive email or
          push notifications from us, and cannot create their own ChoreBoard
          account.
        </p>

        <h3 className="legal-h3">Activity data created as you use the product</h3>
        <ul className="bul">
          <li>
            The chore catalog (chore names, dollar values, cadences) you set
            up.
          </li>
          <li>
            Chore instances — created, claimed, submitted, approved, or missed
            timestamps and the member who took the action.
          </li>
          <li>Optional photos attached to chore submissions.</li>
          <li>
            Ledger entries, weekly tallies, badges, streaks, XP, and goals.
          </li>
        </ul>

        <h3 className="legal-h3">Automatically collected</h3>
        <ul className="bul">
          <li>
            Server logs (IP, user-agent, request path, response status) used
            for security and debugging.
          </li>
          <li>
            A first-party HTTP-only cookie (<code>cb_session</code>) used to
            keep you signed in.
          </li>
          <li>
            Pseudonymous product analytics (which screens you opened, which
            features you used). No advertising pixels, no third-party trackers.
          </li>
          <li>
            Crash reports (stack traces, browser/device model) when something
            goes wrong.
          </li>
        </ul>
      </PolicySection>

      <PolicySection id="kids" num={3} title="Children's data">
        <p>
          ChoreBoard is designed for households where parents add their own
          children. We treat that responsibility seriously.
        </p>
        <ul className="bul">
          <li>
            Kids sign in with a 4-digit PIN selected by a parent. They never
            enter an email address.
          </li>
          <li>
            Kids cannot create their own ChoreBoard account. Only a parent who
            has accepted these terms can add a kid profile.
          </li>
          <li>
            The Owner of a family is the controller of all kid data in their
            household and can delete any kid profile and its history at any
            time from <code>/admin</code>.
          </li>
          <li>
            We do not show advertising to anyone. We do not sell or share kid
            data with anyone for marketing purposes.
          </li>
          <li>
            If you believe a kid profile has been added without parental
            consent, email{' '}
            <a className="legal-link" href="mailto:privacy@choreboard.io">
              privacy@choreboard.io
            </a>{' '}
            and we will remove it within 7 days.
          </li>
        </ul>
      </PolicySection>

      <PolicySection id="use" num={4} title="How we use it">
        <ul className="bul">
          <li>
            Run the product (showing the board, materialising recurring chores,
            sending push notifications you opted in to, etc.).
          </li>
          <li>Authenticate sign-in and keep your session alive.</li>
          <li>
            Send transactional email — sign-up verification, password reset,
            weekly payout summary. We don&apos;t run marketing email campaigns.
          </li>
          <li>
            Improve the product (which features get used, where people get
            stuck).
          </li>
          <li>Investigate bugs, abuse, and security incidents.</li>
          <li>Comply with legal obligations.</li>
        </ul>
        <PolicyCallout>
          We <strong>do not</strong> sell your data, share it with advertisers,
          or use it to build profiles for marketing — yours or your kids&apos;.
        </PolicyCallout>
      </PolicySection>

      <PolicySection id="processors" num={5} title="Sub-processors">
        <p>
          We rely on a small set of vendors to run the service. Each one only
          sees the data they need to do their job, under a written
          data-processing agreement. The list below is current as of the
          effective date.
        </p>
        <table className="processors">
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Data they see</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Render (USA)</td>
              <td>Database, application logs</td>
              <td>Hosting (Postgres + web server)</td>
            </tr>
            <tr>
              <td>Cloudflare R2 (USA / EU)</td>
              <td>Photos you choose to attach</td>
              <td>Object storage for chore photos</td>
            </tr>
            <tr>
              <td>Resend (USA)</td>
              <td>Email address, transactional content</td>
              <td>Sending sign-up, reset, and payout-summary email</td>
            </tr>
            <tr>
              <td>PostHog (USA / EU)</td>
              <td>Pseudonymous product events</td>
              <td>Product analytics</td>
            </tr>
            <tr>
              <td>Sentry (USA)</td>
              <td>Error stack traces, user pseudonym</td>
              <td>Crash reporting</td>
            </tr>
            <tr>
              <td>Apple / Google / Mozilla push gateways</td>
              <td>Encrypted push payloads</td>
              <td>Delivering opt-in browser notifications</td>
            </tr>
          </tbody>
        </table>
        <p>
          We&apos;ll update this list before adding a new sub-processor that
          handles family data. The current list is also published on the
          marketing site at <code>choreboard.io/privacy.html</code>.
        </p>
      </PolicySection>

      <PolicySection id="cookies" num={6} title="Cookies and local storage">
        <p>
          We use a single first-party cookie, <code>cb_session</code>, set as{' '}
          <code>HttpOnly; Secure; SameSite=Lax</code>. It contains only a
          session identifier and is used to keep you signed in. We don&apos;t
          set marketing or third-party tracking cookies.
        </p>
        <p>
          We also store a small amount of data in your browser&apos;s{' '}
          <code>localStorage</code> so the app can remember which family device
          you&apos;re on (for example, the family roster on the kid sign-in
          screen). That data never leaves your browser.
        </p>
      </PolicySection>

      <PolicySection id="security" num={7} title="Security">
        <ul className="bul">
          <li>
            Passwords and PINs are hashed with Argon2id before being written to
            disk.
          </li>
          <li>
            Sessions are server-side. Session cookies are HTTP-only and
            SameSite=Lax.
          </li>
          <li>All traffic is HTTPS in production.</li>
          <li>
            Photos are uploaded directly to Cloudflare R2 over presigned URLs
            and served only over HTTPS.
          </li>
          <li>We follow the principle of least privilege internally.</li>
        </ul>
        <p>
          No system is perfectly secure. We commit to keeping at it and to
          telling affected families promptly if something goes wrong.
        </p>
      </PolicySection>

      <PolicySection id="retention" num={8} title="Data retention">
        <ul className="bul">
          <li>
            <strong>Active families:</strong> we keep your data while your
            account is active.
          </li>
          <li>
            <strong>Inactive families:</strong> if no parent has signed in for
            24 months, we&apos;ll email the Owner and then delete the family
            after 30 days.
          </li>
          <li>
            <strong>Photos attached to chores:</strong> retained for 12 months
            by default, then auto-deleted. The Owner can change this in{' '}
            <code>/admin</code>.
          </li>
          <li>
            <strong>Server logs:</strong> rolling 30 days.
          </li>
          <li>
            <strong>Backups:</strong> rolling 30 days. Any deletion you request
            will replicate to backups within that window.
          </li>
        </ul>
      </PolicySection>

      <PolicySection id="rights" num={9} title="Your rights">
        <p>You can:</p>
        <ul className="bul">
          <li>
            <strong>Access</strong> the data we hold about your family by
            signing in — the app shows you all of it.
          </li>
          <li>
            <strong>Export</strong> the family ledger as CSV from the admin
            screen, and request a full data export by emailing us.
          </li>
          <li>
            <strong>Correct</strong> any record from the admin screens.
          </li>
          <li>
            <strong>Delete</strong> your account and your family at any time.
            Email{' '}
            <a className="legal-link" href="mailto:privacy@choreboard.io">
              privacy@choreboard.io
            </a>{' '}
            and we&apos;ll action within 30 days.
          </li>
          <li>
            <strong>Object</strong> to product analytics — tell us at the same
            address and we&apos;ll exclude your account.
          </li>
          <li>
            <strong>Lodge a complaint</strong> with the Office of the
            Australian Information Commissioner (OAIC) if you believe
            we&apos;ve mishandled your data:{' '}
            <a
              className="legal-link"
              href="https://www.oaic.gov.au/"
              target="_blank"
              rel="noreferrer noopener"
            >
              oaic.gov.au
            </a>
            .
          </li>
        </ul>
        <p>
          If you are in the EU/UK, the same rights are available to you under
          the GDPR/UK GDPR. We process EU/UK personal data on the basis of
          contract (running the product you signed up for) and legitimate
          interest (security and product improvement).
        </p>
      </PolicySection>

      <PolicySection id="transfers" num={10} title="International transfers">
        <p>
          Our hosting and sub-processors may store data in the United States
          and Europe. Where data leaves Australia we rely on contractual
          safeguards consistent with the Australian Privacy Principles and, for
          EU data, Standard Contractual Clauses.
        </p>
      </PolicySection>

      <PolicySection id="changes" num={11} title="Changes to this policy">
        <p>
          We&apos;ll post material changes here and email the Owner of each
          family at least 14 days before they take effect. Trivial fixes
          (typos, vendor name updates, contact addresses) take effect
          immediately.
        </p>
      </PolicySection>

      <PolicySection id="contact" num={12} title="Contact">
        <ul className="bul">
          <li>
            <a className="legal-link" href="mailto:privacy@choreboard.io">
              privacy@choreboard.io
            </a>{' '}
            — privacy questions and rights requests.
          </li>
          <li>
            <a className="legal-link" href="mailto:support@choreboard.io">
              support@choreboard.io
            </a>{' '}
            — everything else.
          </li>
          <li>ChoreBoard, Australia.</li>
        </ul>
      </PolicySection>
    </LegalLayout>
  );
}
