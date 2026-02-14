# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

---

## New features (audio reporting, AI analysis, location, PDF export)

What's included:

- Client-side audio recording and upload to Supabase Storage (`reports-audio` bucket).
- On-device AI heuristics for urgency & category (placeholder for LLM/speech models).
- Geolocation capture (optional, user-consented).
- Admin-editable fields (including report time) from the dashboard.
- Export report -> printable/PDF view from the admin feed.

Quick setup:

1. Run the new DB migration (adds audio/transcript/urgency/location columns): see `supabase/migrations/20260213131000_add_report_fields.sql`.
2. Create a Supabase Storage bucket named `reports-audio` and set public access (or adjust the code to use signed URLs).
3. (Optional) Replace the on-device AI heuristics with a server-side LLM/speech-to-text integration and save `transcript`, `urgency`, and `ai_category` in the `reports` row.
   - A sample Supabase Edge Function scaffold is included at `supabase/functions/analyze` — deploy it and set `VITE_AI_ANALYSIS_URL` to its URL.
4. Start the app: `npm i && npm run dev`.

Notes:

- The UI will attempt client-side speech recognition where available; otherwise audio is uploaded for later processing.
- Organizer/admin users can edit reports (including `created_at`) from the Dashboard → Incident Feed.

---

## Applying DB migration + creating storage bucket (step-by-step) ✅

1) Apply DB migration (choices):
   - Quick (dashboard): Open Supabase dashboard → SQL Editor → New Query → paste the SQL file `supabase/migrations/20260213131000_add_report_fields.sql` → Run.
   - CLI (if you have `supabase` CLI installed):
     - link the project: `supabase link --project-ref <project_id>`
     - then run your migration using the CLI or paste the SQL in the SQL editor.
   - psql (advanced): fetch DB connection string from Supabase → run:
     ```bash
     PGPASSWORD='<db_password>' psql "host=<db_host> user=postgres dbname=postgres port=5432 sslmode=require" -f supabase/migrations/20260213131000_add_report_fields.sql
     ```

2) Create Storage bucket `reports-audio` (Dashboard):
   - Supabase → Storage → New bucket → name `reports-audio` → choose **Public** (or private + signed URLs).
   - If private: update frontend to request signed URLs (we can change the code to use `createSignedUrl`).

3) (Optional) Deploy server AI endpoint (recommended):
   - The repo contains `supabase/functions/analyze` — a simple OpenAI classifier.
   - Deploy: `supabase functions deploy analyze --project-ref <project_id>` (or use dashboard functions UI).
   - Set the function secret: `OPENAI_API_KEY` (DO NOT expose this key to the frontend).
   - Add site env var `VITE_AI_ANALYSIS_URL` pointing to the deployed function URL.

4) Update frontend env and deploy site (Supabase Sites or Vercel):
   - Set these env vars for the deployed site:
     - `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_AI_ANALYSIS_URL` (if using server AI).
   - Build command: `npm run build`, Publish directory: `dist`.


## How to verify everything is working 🔍

1. In Supabase Table editor: confirm `public.reports` has new columns (`audio_url`, `transcript`, `urgency`, `ai_category`, `latitude`, `longitude`).
2. In Supabase Storage: confirm `reports-audio` exists.
3. Run the app (local or deployed) → submit a report with audio + location → check `reports` row for `audio_url`, `transcript`, and `urgency`.
4. If using Edge Function: test with curl:
   ```bash
   curl -X POST $VITE_AI_ANALYSIS_URL -H 'Content-Type: application/json' -d '{"text":"There is a fire and people are screaming"}'
   ```

---

If you'd like, I can:
- Deploy the sample Edge Function (need your Supabase access or CLI installed here).
- Convert audio storage to private + signed URLs.
- Add batch export (CSV/PDF) in the admin UI.

Tell me which of these you want next.

