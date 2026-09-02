#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/validate-github-token.sh
source "$SCRIPT_DIR/lib/validate-github-token.sh"

: "${GCP_PROJECT_ID:?GCP_PROJECT_ID is required. Set the exact Google Cloud project before provisioning.}"

PROJECT_ID="$GCP_PROJECT_ID"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${GCP_RELAY_SERVICE:-tap-github-scheduler-relay}"
RUNTIME_SA_NAME="${GCP_RELAY_RUNTIME_SA:-tap-scheduler-relay}"
INVOKER_SA_NAME="${GCP_SCHEDULER_INVOKER_SA:-tap-scheduler-invoker}"
SECRET_NAME="${GCP_GITHUB_SECRET_NAME:-github-dispatch-token}"
MEDIA_JOB="${GCP_MEDIA_JOB_NAME:-tap-monitoramento-media-failsafe}"
PUBLISHER_JOB="${GCP_PUBLISHER_JOB_NAME:-tap-instagram-publisher-failsafe}"
GITHUB_OWNER="${GITHUB_OWNER:-thalesandradepereira}"
MEDIA_REPOSITORY="${GCP_MEDIA_REPOSITORY:-monitoramento-internacional}"
PUBLISHER_REPOSITORY="${GCP_PUBLISHER_REPOSITORY:-monitoramento-social-publisher}"

required_commands=(gcloud curl)
for command_name in "${required_commands[@]}"; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "$command_name is required." >&2
    exit 1
  fi
done

validate_github_dispatch_token "${GITHUB_DISPATCH_TOKEN:-}"

ACTIVE_ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n 1)"
if [[ -z "$ACTIVE_ACCOUNT" ]]; then
  echo "No active Google Cloud identity found. Run 'gcloud auth login' or use Cloud Shell first." >&2
  exit 1
fi

if ! gcloud projects describe "$PROJECT_ID" --format='value(projectId)' >/dev/null 2>&1; then
  echo "Google Cloud project '$PROJECT_ID' does not exist or the active identity cannot access it." >&2
  exit 1
fi

BILLING_ENABLED="$(
  gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null || true
)"
if [[ "$BILLING_ENABLED" == "False" ]]; then
  echo "Billing is disabled for '$PROJECT_ID'. Cloud Scheduler/Run provisioning requires an enabled billing account." >&2
  exit 1
elif [[ -z "$BILLING_ENABLED" ]]; then
  echo "[gcp] Warning: billing status could not be inspected with the current identity; provisioning will continue."
fi

echo "[gcp] Active identity: $ACTIVE_ACCOUNT"
echo "[gcp] Target project: $PROJECT_ID"
echo "[gcp] Region: $REGION"

verify_github_dispatch_access() {
  local repository="$1"
  local response_file
  response_file="$(mktemp)"
  local http_code

  http_code="$(
    curl --silent --show-error \
      --output "$response_file" \
      --write-out '%{http_code}' \
      --request POST \
      --header 'Accept: application/vnd.github+json' \
      --header "Authorization: Bearer ${GITHUB_DISPATCH_TOKEN}" \
      --header 'X-GitHub-Api-Version: 2022-11-28' \
      --header 'Content-Type: application/json' \
      "https://api.github.com/repos/${GITHUB_OWNER}/${repository}/dispatches" \
      --data '{"event_type":"gcp_connectivity_probe","client_payload":{"purpose":"permission_check_no_workflow"}}'
  )"

  if [[ "$http_code" != "204" ]]; then
    echo "GitHub dispatch permission check failed for ${GITHUB_OWNER}/${repository}: HTTP $http_code." >&2
    rm -f "$response_file"
    return 1
  fi

  rm -f "$response_file"
  echo "[github] repository_dispatch permission confirmed for ${GITHUB_OWNER}/${repository}."
}

# Connectivity probes intentionally use an event type that production workflows do not subscribe to.
# A 204 response proves repository_dispatch permission without sending e-mail or publishing to Instagram.
verify_github_dispatch_access "$MEDIA_REPOSITORY"
verify_github_dispatch_access "$PUBLISHER_REPOSITORY"

echo "[gcp] Enabling required APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  iamcredentials.googleapis.com \
  --project "$PROJECT_ID"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
if [[ -z "$PROJECT_NUMBER" ]]; then
  echo "Google Cloud project number could not be resolved for '$PROJECT_ID'." >&2
  exit 1
fi

CLOUD_BUILD_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
if ! gcloud projects get-iam-policy "$PROJECT_ID" \
  --flatten='bindings[].members' \
  --filter="bindings.role=roles/run.builder AND bindings.members=serviceAccount:${CLOUD_BUILD_SA}" \
  --format='value(bindings.role)' | grep -qx 'roles/run.builder'; then
  echo "[gcp] Granting Cloud Run Builder to default Cloud Build service account: $CLOUD_BUILD_SA"
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${CLOUD_BUILD_SA}" \
    --role roles/run.builder >/dev/null
else
  echo "[gcp] Cloud Run Builder already granted to: $CLOUD_BUILD_SA"
fi

RUNTIME_SA="${RUNTIME_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
INVOKER_SA="${INVOKER_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

for sa in "$RUNTIME_SA_NAME" "$INVOKER_SA_NAME"; do
  if ! gcloud iam service-accounts describe "${sa}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --project "$PROJECT_ID" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$sa" \
      --project "$PROJECT_ID" \
      --display-name "$sa"
  fi
done

if ! gcloud secrets describe "$SECRET_NAME" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud secrets create "$SECRET_NAME" \
    --project "$PROJECT_ID" \
    --replication-policy automatic
fi

printf '%s' "$GITHUB_DISPATCH_TOKEN" | \
  gcloud secrets versions add "$SECRET_NAME" \
    --project "$PROJECT_ID" \
    --data-file=-

gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
  --project "$PROJECT_ID" \
  --member "serviceAccount:${RUNTIME_SA}" \
  --role roles/secretmanager.secretAccessor >/dev/null

echo "[gcp] Deploying private Cloud Run relay..."
deploy_cloud_run() {
  gcloud run deploy "$SERVICE_NAME" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --source "$SCRIPT_DIR" \
    --service-account "$RUNTIME_SA" \
    --set-secrets "GITHUB_TOKEN=${SECRET_NAME}:latest" \
    --set-env-vars "GITHUB_OWNER=${GITHUB_OWNER}" \
    --no-allow-unauthenticated \
    --min-instances 0 \
    --max-instances 1 \
    --memory 256Mi \
    --cpu 1 \
    --concurrency 10 \
    --timeout 15s \
    --quiet
}

for attempt in 1 2 3; do
  deploy_log="$(mktemp)"
  if deploy_cloud_run 2>&1 | tee "$deploy_log"; then
    rm -f "$deploy_log"
    break
  fi

  if ! grep -Eqi 'PERMISSION_DENIED.*default service account|default service account.*IAM permissions|roles/run.builder' "$deploy_log"; then
    rm -f "$deploy_log"
    echo "Cloud Run deployment failed for a non-IAM reason; refusing blind retry." >&2
    exit 1
  fi

  if [[ "$attempt" == "3" ]]; then
    rm -f "$deploy_log"
    echo "Cloud Run deployment still lacks propagated builder IAM after 3 attempts." >&2
    exit 1
  fi

  wait_seconds=$((attempt * 45))
  echo "[gcp] Builder IAM may still be propagating; retrying Cloud Run deploy in ${wait_seconds}s..."
  rm -f "$deploy_log"
  sleep "$wait_seconds"
done

SERVICE_URL="$(
  gcloud run services describe "$SERVICE_NAME" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --format='value(status.url)'
)"

if [[ -z "$SERVICE_URL" ]]; then
  echo "Cloud Run service URL could not be resolved." >&2
  exit 1
fi

gcloud run services add-iam-policy-binding "$SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --member "serviceAccount:${INVOKER_SA}" \
  --role roles/run.invoker >/dev/null

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

  if gcloud scheduler jobs describe "$job_name" \
    --project "$PROJECT_ID" \
    --location "$REGION" >/dev/null 2>&1; then
    gcloud scheduler jobs update http "$job_name" "${common[@]}" >/dev/null
  else
    gcloud scheduler jobs create http "$job_name" "${common[@]}" >/dev/null
  fi
}

# External media clock overlaps the latter part of the GitHub window instead of waiting
# until 06:41. It fires every 30 minutes from 03:11 through 06:41; application-level
# idempotency makes all later dispatches no-ops after the first completed edition.
upsert_job \
  "$MEDIA_JOB" \
  "11,41 3-6 * * *" \
  "/dispatch/media" \
  "External failsafe for Monitoramento Internacional with 30-minute recovery cadence"

upsert_job \
  "$PUBLISHER_JOB" \
  "41,51 5 * * *" \
  "/dispatch/publisher" \
  "External failsafe for Instagram publisher after GitHub watchdogs"

cleanup_old_secret_versions() {
  local versions
  mapfile -t versions < <(
    gcloud secrets versions list "$SECRET_NAME" \
      --project "$PROJECT_ID" \
      --filter='state=ENABLED' \
      --sort-by='~createTime' \
      --format='value(name)'
  )

  if (( ${#versions[@]} <= 1 )); then
    return
  fi

  for version in "${versions[@]:1}"; do
    [[ -z "$version" ]] && continue
    gcloud secrets versions destroy "$version" \
      --secret "$SECRET_NAME" \
      --project "$PROJECT_ID" \
      --quiet >/dev/null
    echo "[gcp] Destroyed superseded Secret Manager version: $version"
  done
}

# Keep one active dispatch-token version to remain well below Secret Manager's free allowance.
cleanup_old_secret_versions

for job_name in "$MEDIA_JOB" "$PUBLISHER_JOB"; do
  gcloud scheduler jobs describe "$job_name" \
    --project "$PROJECT_ID" \
    --location "$REGION" \
    --format='table(name.basename(),state,schedule,timeZone,httpTarget.uri)' || exit 1
done

echo
echo "Google Cloud Scheduler failsafe configured."
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Relay: $SERVICE_URL"
echo "Media job: $MEDIA_JOB (03:11/03:41 through 06:11/06:41 America/Sao_Paulo)"
echo "Publisher job: $PUBLISHER_JOB (05:41 and 05:51 America/Sao_Paulo)"
echo
echo "The deployment is idempotent. Re-running it updates the service/jobs instead of creating duplicates."
echo "For a live end-to-end verification, execute each Scheduler job only after confirming"
echo "today's authoritative application state is already completed."
