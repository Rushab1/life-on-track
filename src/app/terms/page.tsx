import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Life on Track",
};

const UPDATED = "June 11, 2026";

export default function TermsPage() {
  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-stone-900 mb-1">
        Terms of Service
      </h1>
      <p className="text-xs text-stone-400 mb-8">Last updated {UPDATED}</p>

      <div className="card p-6 space-y-6 text-sm text-stone-700 leading-relaxed">
        <section>
          <h2 className="font-semibold text-stone-900 mb-2">1. The service</h2>
          <p>
            Life on Track is a personal life-tracking application offering
            daily logging, workout tracking, planning, and optional Google
            Calendar and Oura Ring integrations. By creating an account or
            using the service you agree to these terms.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-stone-900 mb-2">2. Your account and data</h2>
          <p>
            You are responsible for the accuracy of what you log and for
            keeping access to your email account secure (sign-in is via magic
            link). Your data remains yours; how we handle it is described in
            the{" "}
            <a className="text-indigo-600 hover:text-indigo-700 underline" href="/privacy">
              Privacy Policy
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-stone-900 mb-2">3. Not medical advice</h2>
          <p>
            The app displays health-related information (pain levels, sleep and
            readiness metrics from Oura, workout data) for personal tracking
            only. It is not a medical device and provides no medical advice,
            diagnosis, or treatment. Consult a healthcare professional for
            medical decisions.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-stone-900 mb-2">4. Third-party services</h2>
          <p>
            Google Calendar and Oura integrations depend on those providers&apos;
            APIs and your authorization, which you can revoke at any time. We
            are not responsible for changes, outages, or data inaccuracies in
            third-party services.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-stone-900 mb-2">5. Acceptable use</h2>
          <p>
            Don&apos;t attempt to access other users&apos; data, disrupt the
            service, or use it for unlawful purposes. We may suspend accounts
            that do.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-stone-900 mb-2">6. Warranty and liability</h2>
          <p>
            The service is provided &quot;as is&quot;, without warranties of
            any kind. To the maximum extent permitted by law, the operator is
            not liable for any indirect, incidental, or consequential damages,
            or for loss of data. Your sole remedy for dissatisfaction is to
            stop using the service and request deletion of your data.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-stone-900 mb-2">7. Changes and termination</h2>
          <p>
            These terms may be updated as the service evolves; continued use
            after an update constitutes acceptance. You can stop using the
            service and request account deletion at any time.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-stone-900 mb-2">8. Contact</h2>
          <p>
            Questions:{" "}
            <a
              className="text-indigo-600 hover:text-indigo-700 underline"
              href="mailto:rushabmunot1@gmail.com"
            >
              rushabmunot1@gmail.com
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
