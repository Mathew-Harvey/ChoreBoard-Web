import {
  LegalLayout,
  PolicyCallout,
  PolicySection,
  PolicySummary,
} from './LegalLayout';

/**
 * In-app rendering of the Terms of Service. Same content as the static
 * `/terms.html` on the marketing site, rendered through the React shell so a
 * signed-in family can review it without leaving app.choreboard.io.
 *
 * If you change copy here, mirror it in
 * `../../../../ChoreBoard-Landing/terms.html` so the two versions don't
 * drift.
 */
export function TermsOfService() {
  return (
    <LegalLayout
      page="terms"
      pageIndex={7}
      pageLabel="TERMS OF SERVICE"
      pageTitle="Terms of Service"
      effective="12 May 2026"
      contact={{ label: 'legal@choreboard.io', href: 'mailto:legal@choreboard.io' }}
      intro={
        <PolicySummary accent="blue">
          <span>
            These Terms cover your use of ChoreBoard at{' '}
            <a className="legal-link" href="https://choreboard.io">
              choreboard.io
            </a>{' '}
            and{' '}
            <a className="legal-link" href="https://app.choreboard.io">
              app.choreboard.io
            </a>
            .
          </span>
          <span>
            An adult creates the family account (the <strong>Owner</strong>)
            and accepts these Terms on behalf of every member of their
            household.
          </span>
          <span>
            ChoreBoard is a tracker. It does not move money. Dollars in the app
            are owed by one human in the household to another, settled by their
            own arrangement.
          </span>
          <span>
            v1 is in closed beta. We can change features, add a paid plan
            later, and (rarely) take the service down for maintenance.
          </span>
          <span>
            If something goes wrong, our liability is limited to what
            you&apos;ve paid us in the last 12 months — which today is $0.
          </span>
        </PolicySummary>
      }
    >
      <PolicySection id="agreement" num={1} title="The agreement">
        <p>
          These Terms of Service (&ldquo;<strong>Terms</strong>&rdquo;) form a
          contract between you and ChoreBoard (&ldquo;<strong>we</strong>&rdquo;,
          &ldquo;<strong>us</strong>&rdquo;, &ldquo;<strong>our</strong>&rdquo;)
          for your use of the ChoreBoard service: the marketing site at{' '}
          <a className="legal-link" href="https://choreboard.io">
            choreboard.io
          </a>
          , the web app at{' '}
          <a className="legal-link" href="https://app.choreboard.io">
            app.choreboard.io
          </a>
          , and any installed PWA versions of either (&ldquo;
          <strong>the Service</strong>&rdquo;).
        </p>
        <p>
          By creating an account, signing in, or otherwise using the Service,
          you accept these Terms and our{' '}
          <a className="legal-link" href="/privacy">
            Privacy Policy
          </a>
          . If you don&apos;t accept them, don&apos;t use the Service.
        </p>
      </PolicySection>

      <PolicySection id="eligibility" num={2} title="Eligibility">
        <p>
          You must be at least 18 years old (or the age of majority in your
          jurisdiction, whichever is higher) to create a ChoreBoard account.
          By signing up, you confirm:
        </p>
        <ul className="bul">
          <li>You are an adult.</li>
          <li>
            You have authority to add the other members of your household to
            the Service.
          </li>
          <li>
            You have the consent of any other parent or guardian to add their
            children.
          </li>
          <li>
            You will not use the Service for any purpose that is illegal in
            your jurisdiction.
          </li>
        </ul>
      </PolicySection>

      <PolicySection id="accounts" num={3} title="Accounts and roles">
        <ul className="bul">
          <li>
            <strong>Owner</strong> — the parent who created the account. Has
            admin rights and (later, when paid plans launch) billing.
          </li>
          <li>
            <strong>Parent</strong> — can approve chores, edit the catalog,
            manage members, and view the ledger.
          </li>
          <li>
            <strong>Kid</strong> — added by a parent. Signs in with a 4-digit
            PIN. Can claim and submit chores but cannot self-approve.
          </li>
        </ul>
        <p>
          You are responsible for keeping your password and any parent PINs
          confidential. If you suspect they have been used by someone else,
          write to{' '}
          <a className="legal-link" href="mailto:security@choreboard.io">
            security@choreboard.io
          </a>{' '}
          and we&apos;ll help you reset.
        </p>
      </PolicySection>

      <PolicySection id="use" num={4} title="Acceptable use">
        <p>Don&apos;t use ChoreBoard to:</p>
        <ul className="bul">
          <li>Harass, bully, or shame any household member.</li>
          <li>
            Upload illegal content, including any sexual content involving a
            minor — we will report this to the relevant authority and terminate
            the account immediately.
          </li>
          <li>
            Reverse-engineer, scrape, or load-test the Service, except as
            expressly permitted by law.
          </li>
          <li>
            Re-sell ChoreBoard, run it as a service for someone else&apos;s
            family, or wrap it in another product without our written
            agreement.
          </li>
          <li>
            Require a child to perform chores beyond what is age-appropriate or
            beyond what is permitted by the law applicable to their location.
          </li>
          <li>Attempt to bypass any security or rate limiting.</li>
        </ul>
      </PolicySection>

      <PolicySection id="money" num={5} title="Money is between humans">
        <PolicyCallout variant="warn">
          <strong>Important:</strong> ChoreBoard is a tracker. It is{' '}
          <strong>not</strong> a payment processor and it does{' '}
          <strong>not</strong> move money between accounts.
        </PolicyCallout>
        <p>
          ChoreBoard tracks dollar amounts associated with chores. All payouts
          are settled by the household — by cash, bank transfer, or any other
          arrangement you choose — outside of ChoreBoard. The
          &ldquo;ledger&rdquo; and &ldquo;paid&rdquo; status are bookkeeping
          features only.
        </p>
        <p>
          You release ChoreBoard from any dispute about whether a chore was
          actually completed, whether a payout was made, or whether the dollar
          value was fair. Those are family decisions and we just record what
          was entered. If you need to correct a mistake, the Owner can edit
          any ledger entry from <code>/admin</code>.
        </p>
      </PolicySection>

      <PolicySection id="kids" num={6} title="Children's accounts (parental responsibility)">
        <ul className="bul">
          <li>
            A parent who adds a child to ChoreBoard is responsible for that
            child&apos;s use of the Service.
          </li>
          <li>
            The Owner can review, edit, or delete any kid&apos;s record at any
            time from <code>/admin</code>.
          </li>
          <li>
            We will honour requests from a parent to delete a kid&apos;s data
            within 30 days. Email{' '}
            <a className="legal-link" href="mailto:privacy@choreboard.io">
              privacy@choreboard.io
            </a>
            .
          </li>
          <li>
            We do not communicate with children directly. Kids do not receive
            email, push notifications, or marketing of any kind from us.
          </li>
        </ul>
      </PolicySection>

      <PolicySection id="beta" num={7} title="Beta and changes to the Service">
        <ul className="bul">
          <li>
            v1 of ChoreBoard is in closed beta. Some features will change,
            others will be added or removed.
          </li>
          <li>
            We aim for high availability but provide the Service &ldquo;as
            is&rdquo; with no uptime guarantee during the beta period.
          </li>
          <li>
            We may add or remove sub-processors, change the chore catalog
            defaults, or adjust the gamification curve. Material changes that
            affect families&apos; data are described in the{' '}
            <a className="legal-link" href="/privacy">
              Privacy Policy
            </a>
            .
          </li>
        </ul>
      </PolicySection>

      <PolicySection id="pricing" num={8} title="Pricing">
        <p>
          ChoreBoard is free during the closed beta. If we introduce paid
          plans, the Owner will be notified and asked to opt in{' '}
          <strong>before</strong> any charge is made. A meaningful free tier
          will remain.
        </p>
      </PolicySection>

      <PolicySection id="content" num={9} title="Your content">
        <ul className="bul">
          <li>
            You retain ownership of the content you put into ChoreBoard —
            chore names, photos, ledger entries, family names, kids&apos;
            display names, and so on (&ldquo;<strong>Your Content</strong>
            &rdquo;).
          </li>
          <li>
            You grant us a non-exclusive, royalty-free, worldwide licence to
            host, copy, transmit, display, and back up Your Content for the
            sole purpose of running the Service for you.
          </li>
          <li>
            That licence ends when you delete the content (subject to the
            backup window described in the Privacy Policy).
          </li>
          <li>
            You are responsible for the legality of Your Content. You confirm
            you have the rights to upload it.
          </li>
        </ul>
      </PolicySection>

      <PolicySection id="ip" num={10} title="Our intellectual property">
        <p>
          The ChoreBoard name, logo, design system, app code, and documentation
          are owned by us. You may use them only as needed to use the Service.
          You may not use the name or logo to imply endorsement or affiliation
          without our written permission.
        </p>
        <p>
          Open-source components shipped with ChoreBoard remain governed by
          their respective licences.
        </p>
      </PolicySection>

      <PolicySection id="termination" num={11} title="Termination">
        <ul className="bul">
          <li>
            You can delete your family at any time. Email{' '}
            <a className="legal-link" href="mailto:privacy@choreboard.io">
              privacy@choreboard.io
            </a>
            .
          </li>
          <li>
            We may suspend or terminate access if you breach these Terms, if
            we reasonably suspect fraud or abuse, or if we are required to by
            law. We&apos;ll give notice where we can.
          </li>
          <li>
            On termination, we&apos;ll delete your data within 30 days, subject
            to the retention windows described in the Privacy Policy.
          </li>
          <li>
            Sections that by their nature should survive termination
            (intellectual property, disclaimers, liability, indemnity, governing
            law) survive.
          </li>
        </ul>
      </PolicySection>

      <PolicySection id="disclaimers" num={12} title="Disclaimers">
        <p>
          The Service is provided <strong>&ldquo;as is&rdquo;</strong> and{' '}
          <strong>&ldquo;as available&rdquo;</strong>, without any warranty
          (express or implied) of merchantability, fitness for a particular
          purpose, or non-infringement. We do not warrant that the Service
          will be uninterrupted, error-free, or that data will never be lost.
        </p>
        <p>
          Nothing in these Terms excludes or limits any consumer guarantee
          that cannot lawfully be excluded under the Australian Consumer Law
          (or equivalent legislation in your jurisdiction).
        </p>
      </PolicySection>

      <PolicySection id="liability" num={13} title="Limitation of liability">
        <p>
          To the maximum extent permitted by law, our aggregate liability
          arising out of or relating to the Service is limited to the greater
          of (a) the amount you paid us in the 12 months preceding the event
          giving rise to the claim, or (b) AUD $50.
        </p>
        <p>
          We are not liable for indirect, incidental, special, consequential,
          or punitive damages, or for loss of profit, revenue, data, or
          goodwill.
        </p>
      </PolicySection>

      <PolicySection id="indemnity" num={14} title="Indemnity">
        <p>
          You agree to indemnify and hold us harmless against claims, damages,
          and reasonable costs arising from (a) your breach of these Terms,
          (b) content you upload, or (c) your use of the Service in a way that
          infringes another person&apos;s rights.
        </p>
      </PolicySection>

      <PolicySection id="law" num={15} title="Governing law and venue">
        <p>
          These Terms are governed by the laws of Western Australia,
          Australia. The courts of Western Australia have exclusive
          jurisdiction over any dispute arising under these Terms, except that
          either party may seek urgent injunctive relief in any court of
          competent jurisdiction.
        </p>
      </PolicySection>

      <PolicySection id="changes" num={16} title="Changes to these Terms">
        <p>
          We&apos;ll post material changes here and email the Owner of each
          family at least 14 days before they take effect. Continuing to use
          the Service after that date means you accept the changes. If you
          don&apos;t, you can delete your family at any time.
        </p>
      </PolicySection>

      <PolicySection id="contact" num={17} title="Contact">
        <ul className="bul">
          <li>
            <a className="legal-link" href="mailto:legal@choreboard.io">
              legal@choreboard.io
            </a>{' '}
            — questions about these Terms.
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
