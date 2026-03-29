Here's the prompt:



---



**Build a life management PWA called "Life on Track"**



Create a Next.js 14 app (App Router, TypeScript, Tailwind CSS v4) that saves to Supabase. Push all files to `rushabmunotstage/life-on-track` on branch `main`.



---



**Stack**

- Next.js 14 (App Router, `src/` dir, `@/*` alias)

- TypeScript

- Tailwind CSS v4 (use `@import "tailwindcss"` in globals.css, and `@tailwindcss/postcss` in postcss config — NOT the old `tailwindcss` plugin)

- Supabase (`@supabase/supabase-js`, `@supabase/ssr`)

- PWA (web manifest for iPhone "Add to Home Screen")



---



**Supabase schema** (run in SQL editor):



```sql

create table daily_logs (

  id uuid primary key default gen_random_uuid(),

  user_id uuid references auth.users not null,

  date date not null,

  pain_level smallint check (pain_level between 0 and 10),

  notes text,

  created_at timestamptz default now(),

  updated_at timestamptz default now(),

  unique (user_id, date)

);



create table activity_completions (

  id uuid primary key default gen_random_uuid(),

  user_id uuid references auth.users not null,

  date date not null,

  activity_type text not null,

  completed boolean default true,

  notes text,

  created_at timestamptz default now(),

  unique (user_id, date, activity_type)

);



create table workout_sets (

  id uuid primary key default gen_random_uuid(),

  user_id uuid references auth.users not null,

  date date not null,

  exercise text not null,

  sets smallint,

  reps smallint,

  weight_lbs numeric(6,2),

  duration_mins numeric(5,1),

  notes text,

  created_at timestamptz default now()

);



alter table daily_logs enable row level security;

alter table activity_completions enable row level security;

alter table workout_sets enable row level security;



create policy "own data" on daily_logs for all using (auth.uid() = user_id);

create policy "own data" on activity_completions for all using (auth.uid() = user_id);

create policy "own data" on workout_sets for all using (auth.uid() = user_id);

```



---



**Auth**

- Magic link (OTP) via Supabase email auth — no password

- Single user app, no public access

- On load: check session → show `AuthForm` or `DayLogger`



---



**Features**



**1. Auth screen (`AuthForm`)**

- Email input + "Send magic link" button

- On submit: `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })`

- Shows confirmation message after sending



**2. Main screen (`DayLogger`)**

- Header: "Life on Track" + today's date + sign out button

- Tab switcher: Today / Calendar (calendar tab = "coming soon" placeholder)



**Today tab contains:**



**Pain level slider (`PainSlider`)**

- Range 0–10

- Color coded: 0=green → 5=yellow → 10=dark red (11 colors: `["#22c55e","#4ade80","#86efac","#bef264","#fde047","#fb923c","#f97316","#ef4444","#dc2626","#b91c1c","#7f1d1d"]`)

- Shows current value as colored badge



**Activity checklist**

- Auto-populated based on day of week + month (see schedule below)

- Tap circle to toggle complete/incomplete

- "notes" button expands inline input per activity

- Save note button appears when activity is checked



**Workout logger** (only shown on workout days: Push/Legs Heavy/Legs Light/Pull/Yoga)

- Exercise picker (dropdown): Bench Press, Incline Press, Shoulder Press, Lateral Raise, Tricep Pushdown, Squat, Leg Press, Romanian Deadlift, Leg Curl, Leg Extension, Calf Raise, Deadlift, Pull-up, Barbell Row, Cable Row, Lat Pulldown, Bicep Curl, Other

- Inputs: Sets, Reps, Weight (lbs), Duration (min)

- "Log set" button saves to `workout_sets`

- Lists today's logged sets below with delete (×) button



**Daily notes**

- Textarea: "How was your day?"



**"Save today's log" button**

- Upserts to `daily_logs` (pain_level + notes)



---



**Weekly schedule (fixed by day of week)**



Gym (training):

- Sun: Rest

- Mon: Push

- Tue: Legs Heavy

- Wed: Rest

- Thu: Pull

- Fri: Legs Light

- Sat: Yoga



Prep activities (phase 1 = Apr–May, phase 2 = Jun–Aug):

- Sun: FastMCP

- Mon: Violin + LeetCode

- Tue: ML/AI

- Wed: phase1 → ML/AI + LeetCode, phase2 → LeetCode

- Thu: LeetCode

- Fri: Date night

- Sat: phase1 → System Design, phase2 → System Design + Mock



Activity type keys: `lc, ml, sd, beh, oss, vln, dte, mck, out, psh, lgh, rst, pll, lgl, yga`



---



**File structure**

```

src/

  app/

    globals.css        → @import "tailwindcss"

    layout.tsx         → metadata, PWA tags, apple-touch-icon

    page.tsx           → auth check, renders AuthForm or DayLogger

  components/

    AuthForm.tsx

    DayLogger.tsx      → main logged-in view

    PainSlider.tsx

    WorkoutLogger.tsx

  lib/

    supabase.ts        → createBrowserClient (fallback to placeholder if no env vars)

    types.ts           → DailyLog, ActivityCompletion, WorkoutSet, ActivityType

public/

  manifest.json        → PWA manifest

supabase-schema.sql

.env.local.example

.gitignore

next.config.mjs        → (NOT .ts — Next.js 14 doesn't support .ts config)

postcss.config.mjs     → { plugins: { "@tailwindcss/postcss": {}, autoprefixer: {} } }

tailwind.config.ts

tsconfig.json          → strict, bundler moduleResolution, @/* paths

next-env.d.ts

src/global.d.ts        → declare module "*.css"

```



**Key gotchas:**

- Use `next.config.mjs` not `.ts` (Next.js 14 doesn't support .ts config)

- Tailwind v4: use `@import "tailwindcss"` in CSS and `@tailwindcss/postcss` plugin

- Supabase `createClient` must not throw when env vars are missing (use placeholder fallback) so `next build` works without `.env.local`

- All components are `"use client"`

- Date handling: use local date string `YYYY-MM-DD` (not UTC) via: `` `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` ``



---



**Design**

- Clean, minimal, mobile-first

- Max width 600px, centered

- White cards with `rounded-2xl shadow-sm`

- Gray-900 for primary actions

- Font: system sans-serif



---



After building, push everything to `rushabmunotstage/life-on-track` on `main`.







