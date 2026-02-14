#!/usr/bin/env bash
set -euo pipefail

# Helper to apply DB migration and deploy the `analyze` Edge Function.
# Usage (local):
#   SUPABASE_PROJECT_REF=<ref> SUPABASE_ACCESS_TOKEN=<token> OPENAI_API_KEY=<key> DATABASE_URL=<db-url> ./scripts/supabase-setup.sh
# - DATABASE_URL: optional, if provided the migration SQL will be applied using psql
# - SUPABASE_PROJECT_REF & SUPABASE_ACCESS_TOKEN: required to deploy the Edge Function
# - OPENAI_API_KEY: optional, sets the function secret after deploy

MIGRATION_FILE="supabase/migrations/20260213131000_add_report_fields.sql"

echo "→ Starting Supabase helper script"

if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "- Applying SQL migration using DATABASE_URL..."
  if ! command -v psql >/dev/null 2>&1; then
    echo "  psql not found — attempting to install postgresql-client (requires sudo)..."
    sudo apt-get update && sudo apt-get install -y postgresql-client
  fi
  echo "  Running: psql \"$DATABASE_URL\" -f $MIGRATION_FILE"
  psql "$DATABASE_URL" -f "$MIGRATION_FILE"
  echo "  Migration applied."
else
  echo "- DATABASE_URL not provided — skipping SQL migration. (You can run the SQL in Supabase SQL editor.)"
fi

if [[ -z "${SUPABASE_PROJECT_REF:-}" || -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "- SUPABASE_PROJECT_REF or SUPABASE_ACCESS_TOKEN not set — skipping Edge Function deploy."
  echo "  To deploy the Edge Function locally set SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN and re-run this script."
  exit 0
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "- supabase CLI not found — installing globally (npm)..."
  npm i -g supabase
fi

echo "- Deploying Edge Function 'analyze' to project $SUPABASE_PROJECT_REF..."
SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" supabase functions deploy analyze --project-ref "$SUPABASE_PROJECT_REF"

if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  echo "- Setting OPENAI_API_KEY secret for functions..."
  SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" supabase secrets set OPENAI_API_KEY="$OPENAI_API_KEY" --project-ref "$SUPABASE_PROJECT_REF"
  echo "  Secret set."
else
  echo "- OPENAI_API_KEY not provided — remember to set it in Supabase Secrets if you deploy the analyze function."
fi

cat <<'EOF'

Done.
Next manual steps:
 1) Create storage bucket `reports-audio` in Supabase Console → Storage.
 2) Add site environment variables: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, optionally VITE_AI_ANALYSIS_URL.
 3) Deploy frontend (Supabase Sites or Vercel) and verify reports are inserted with audio/transcript/urgency.

EOF
