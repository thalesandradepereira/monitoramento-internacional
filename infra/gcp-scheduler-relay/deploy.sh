#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-tap-monitoramento-auto}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${GCP_RELAY_SERVICE:-tap-github-scheduler-relay}"
RUNTIME_SA_NAME="${GCP_RELAY_RUNTIME_SA:-tap-scheduler-relay}"
INVOKER_SA_NAME="${GCP_SCHEDULER_INVOKER_SA:-tap-scheduler-invoker}"
SECRET_NAME="${GCP_GITHUB_SECRET_NAME:-github-dispatch-token}"
MEDIA_JOB="${GCP_MEDIA_JOB_NAME:-tap-monitoramento-media-failsafe}"
PUBLISHER_JOB="${GCP_PUBLISHER_JOB_NAME:-tap-instagram-publisher-failsafe}"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud CLI is required." >&2
  exit 1
fi

if [[ -z "${GITHUB_DISPATCH_TOKEN:-}" ]]; then
  echo "GITHUB_DISPATCH_TOKEN is required and must not be committed to the repository." >&2
  exit 1
fi

gcloud config set project "$PROJECT_ID" >/dev/null

echo "[gcp] Enabling required APIs..."
gcloud services enable   run.googleapis.com   cloudscheduler.googleapis.com   secretmanager.googleapis.com   cloudbuild.googleapis.com   artifactregistry.googleapis.com   iamcredentials.googleapis.com   --project "$PROJECT_ID"

RUNTIME_SA="${RUNTIME_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
INVOKER_SA="${INVOKER_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

for sa in "$RUNTIME_SA_NAME" "$INVOKER_SA_NAME"; do
  if ! gcloud iam service-accounts describe "${sa}@${PROJECT_ID}.iam.gserviceaccount.com"     --project "$PROJECT_ID" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$sa"       --project "$PROJECT_ID"       --display-name "$sa"
  fi
done

if ! gcloud secrets describe "$SECRET_NAME" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud secrets create "$SECRET_NAME"     --project "$PROJECT_ID"     --replication-policy automatic
fi

printf '%s' "$GITHUB_DISPATCH_TOKEN" |   gcloud secrets versions add "$SECRET_NAME"     --project "$PROJECT_ID"     --data-file=-

gcloud secrets add-iam-policy-binding "$SECRET_NAME"   --project "$PROJECT_ID"   --member "serviceAccount:${RUNTIME_SA}"   --role roles/secretmanager.secretAccessor >/dev/null

echo "[gcp] Deploying private Cloud Run relay..."
gcloud run deploy "$SERVICE_NAME"   --project "$PROJECT_ID"   --region "$REGION"   --source "$(cd "$(dirname "$0")" && pwd)"   --service-account "$RUNTIME_SA"   --set-secrets "GITHUB_TOKEN=${SECRET_NAME}:latest"   --set-env-vars "GITHUB_OWNER=thalesandradepereira"   --no-allow-unauthenticated   --min-instances 0   --max-instances 1   --memory 256Mi   --cpu 1   --concurrency 10   --timeout 15s   --quiet

SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME"   --project "$PROJECT_ID"   --region "$REGION"   --format='value(status.url)')"

if [[ -z "$SERVICE_URL" ]]; then
  echo "Cloud Run service URL could not be resolved." >&2
  exit 1
fi

gcloud run services add-iam-policy-binding "$SERVICE_NAME"   --project "$PROJECT_ID"   --region "$REGION"   --member "serviceAccount:${INVOKER_SA}"   --role roles/run.invoker >/dev/null

upsert_job() {
  local job_name="$1"
  local schedule="$2"
  local endpoint="$3"
  local description="$4"

  local common=(
    "--project=$PROJECT_ID"
    "--location=$REGION"
    "--schedule=$schedule"
    "--time-zone=America/Sao_Paulo"
    "--uri=${SERVICE_URL}${endpoint}"
    "--http-method=POST"
    "--headers=Content-Type=application/json"
    "--message-body={}"
    "--oidc-service-account-email=$INVOKER_SA"
    "--oidc-token-audience=$SERVICE_URL"
    "--attempt-deadline=30s"
    "--max-retry-attempts=3"
    "--min-backoff=30s"
    "--max-backoff=300s"
    "--max-doublings=3"
    "--description=$description"
  )

  if gcloud scheduler jobs describe "$job_name"     --project "$PROJECT_ID"     --location "$REGION" >/dev/null 2>&1; then
    gcloud scheduler jobs update http "$job_name" "${common[@]}" >/dev/null
  else
    gcloud scheduler jobs create http "$job_name" "${common[@]}" >/dev/null
  fi
}

# External clock runs only after the internal GitHub schedules/watchdogs.
# Each job fires twice; application-level idempotency prevents duplicates.
upsert_job   "$MEDIA_JOB"   "41,51 6 * * *"   "/dispatch/media"   "External failsafe for Monitoramento Internacional after GitHub watchdogs"

upsert_job   "$PUBLISHER_JOB"   "41,51 5 * * *"   "/dispatch/publisher"   "External failsafe for Instagram publisher after GitHub watchdogs"

echo
echo "Google Cloud Scheduler failsafe configured."
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Relay: $SERVICE_URL"
echo "Media job: $MEDIA_JOB (06:41 and 06:51 America/Sao_Paulo)"
echo "Publisher job: $PUBLISHER_JOB (05:41 and 05:51 America/Sao_Paulo)"
echo
echo "For a live verification, run each job once only after confirming today's"
echo "application state is already completed; the pipelines are idempotent."
