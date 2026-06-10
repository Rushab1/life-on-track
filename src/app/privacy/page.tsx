import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Life on Track",
};

const UPDATED = "June 11, 2026";

export default function PrivacyPage() {
  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-stone-100 mb-1">
        Privacy Policy
      </h1>
      <p className="text-xs text-stone-500 mb-8">Last updated {UPDATED}</p>

      <div className="card p-6 space-y-6 text-sm text-stone-300 leading-relaxed">
        <section>
          <h2 className="font-semibold text-stone-100 mb-2">What Life on Track is</h2>
          <p>
            Life on Track is a personal life-tracking app: daily logs, workouts,
            activities, notes, and optional integrations with Google Calendar
            and Oura Ring. Your data exists to be shown back to you — nothing
            else.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-stone-100 mb-2">Data we store</h2>
          <ul className="list-disc ml-5 space-y-1.5">
            <li>Your account email (used to sign you in via magic link).</li>
            <li>
              The content you log: daily notes, pain levels, activities,
              workout sets, plans, custom trackers, and life events.
            </li>
            <li>
              If you connect <strong>Google Calendar</strong>: OAuth tokens and
              a read-only mirror of your calendar events for a two-week window,
              used to display them in the app and to sync your plan to your
              calendar.
            </li>
            <li>
              If you connect <strong>Oura Ring</strong>: OAuth tokens and your
              daily sleep, readiness, and activity metrics (scores, sleep
              duration, HRV, resting heart rate, steps, calories), used to
              display them alongside your logs.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-stone-100 mb-2">Where it lives and who can see it</h2>
          <p>
            Data is stored in Supabase (Postgres) with row-level security: every
            row is keyed to your user id and only readable by you. The app is
            hosted on Vercel. No human reviews your data, and we do not sell,
            share, advertise with, or train models on it.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-stone-100 mb-2">Third-party APIs</h2>
          <p>
            Google Calendar data is accessed per the{" "}
            <a
              className="text-indigo-400 hover:text-indigo-300 underline"
              href="https://developers.google.com/terms/api-services-user-data-policy"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements. Oura data is accessed via
            the Oura API v2 only after you explicitly authorize it. Both
            integrations are optional and the app works without them.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-stone-100 mb-2">AI assistant access (MCP)</h2>
          <p>
            You can optionally authorize an AI assistant (e.g. Claude) to read
            and write your data through the app&apos;s MCP API. That access uses
            tokens you generate and can revoke at any time in Settings, and is
            scoped to your own data only.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-stone-100 mb-2">Deleting your data</h2>
          <p>
            Disconnecting Google or Oura in Settings revokes the grant and
            deletes the stored tokens immediately. Day logs can be deleted in
            the app. For full account deletion, contact the operator at the
            email below and all your rows are removed.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-stone-100 mb-2">Contact</h2>
          <p>
            Questions or deletion requests:{" "}
            <a
              className="text-indigo-400 hover:text-indigo-300 underline"
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
