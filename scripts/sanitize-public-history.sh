#!/usr/bin/env bash
set -euo pipefail

EXPECTED_REPOSITORY="thalesandradepereira/monitoramento-internacional"
AUTHORIZATION_MARKER="AUTHORIZED-HISTORY-REWRITE-2026-08-27"
MARKER_PATH="ops/history-rewrite-authorized.txt"
NOREPLY_EMAIL="186466926+thalesandradepereira@users.noreply.github.com"

fail() {
  echo "::error::$1"
  exit 1
}

[[ "${GITHUB_REPOSITORY:-}" == "$EXPECTED_REPOSITORY" ]] || fail "Unexpected repository."
[[ "${GITHUB_REF:-}" == "refs/heads/main" ]] || fail "History rewrite is authorized only from main."
[[ -n "${GITHUB_TOKEN:-}" ]] || fail "GITHUB_TOKEN is required."
[[ -f "$MARKER_PATH" ]] || fail "Authorization marker is missing."
[[ "$(tr -d '\r\n' < "$MARKER_PATH")" == "$AUTHORIZATION_MARKER" ]] || fail "Authorization marker does not match."

git status --porcelain | grep -q . && fail "Working tree must be clean before history rewrite."

REMOTE_URL="https://github.com/${GITHUB_REPOSITORY}.git"
AUTH_HEADER="$(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64 -w0)"

git_auth() {
  git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic ${AUTH_HEADER}" "$@"
}

echo "[history-sanitize] Fetching all branch and tag refs..."
git_auth fetch --force --tags origin '+refs/heads/*:refs/remotes/origin/*'

# Materialize every remote branch as a local branch so filter-repo rewrites all public heads.
while read -r ref sha; do
  branch_name="${ref#refs/remotes/origin/}"
  [[ "$branch_name" == "HEAD" ]] && continue
  git update-ref "refs/heads/${branch_name}" "$sha"
done < <(git for-each-ref --format='%(refname) %(objectname)' refs/remotes/origin)

BEFORE_BRANCH_COUNT="$(git for-each-ref --format='%(refname)' refs/heads | wc -l | tr -d ' ')"
BEFORE_TAG_COUNT="$(git for-each-ref --format='%(refname)' refs/tags | wc -l | tr -d ' ')"
[[ "$BEFORE_BRANCH_COUNT" -gt 0 ]] || fail "No local branch refs were materialized."

git for-each-ref --format='%(refname)' refs/heads | sort > /tmp/branches-before.txt
git for-each-ref --format='%(refname)' refs/tags | sort > /tmp/tags-before.txt

# Ephemeral rollback bundle: never uploaded, never printed, destroyed with the runner.
git bundle create /tmp/pre-sanitize.bundle --branches --tags >/dev/null

# Byte-for-byte preservation gate for every currently published docs artifact.
find docs -type f -print0 | sort -z | xargs -0 sha256sum > /tmp/docs-before.sha256
DOC_COUNT="$(wc -l < /tmp/docs-before.sha256 | tr -d ' ')"
[[ "$DOC_COUNT" -gt 0 ]] || fail "No docs artifacts found; refusing history rewrite."

# Discover every historical recipients.txt location instead of assuming a single path.
git log --all --name-only --pretty=format: |
  sed '/^$/d' |
  grep -E '(^|/)recipients\.txt$' |
  sort -u > /tmp/recipient-paths.txt || true

[[ -s /tmp/recipient-paths.txt ]] || fail "No historical recipients.txt path was discovered; refusing a blind rewrite."
RECIPIENT_PATH_COUNT="$(wc -l < /tmp/recipient-paths.txt | tr -d ' ')"

# Extract recipient addresses only into an ephemeral file. Never print the values.
: > /tmp/recipient-emails.raw
while IFS= read -r path; do
  while IFS= read -r commit; do
    git show "${commit}:${path}" 2>/dev/null || true
  done < <(git rev-list --all -- "$path")
done < /tmp/recipient-paths.txt |
  grep -Eio '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'   >> /tmp/recipient-emails.raw || true

tr '[:upper:]' '[:lower:]' < /tmp/recipient-emails.raw | sort -u > /tmp/recipient-emails.txt
RECIPIENT_EMAIL_COUNT="$(wc -l < /tmp/recipient-emails.txt | tr -d ' ')"
[[ "$RECIPIENT_EMAIL_COUNT" -gt 0 ]] || fail "Historical recipient paths contained no addresses; refusing rewrite."

# Replace every historical recipient address in blobs and commit/tag messages.
: > /tmp/replacements.txt
while IFS= read -r email; do
  printf 'literal:%s==>***REMOVED-RECIPIENT-PII***\n' "$email" >> /tmp/replacements.txt
done < /tmp/recipient-emails.txt

# Rewrite maintainer commit metadata to a GitHub noreply address.
cat > /tmp/mailmap <<EOF
Thales Andrade Pereira <${NOREPLY_EMAIL}> <***REMOVED-RECIPIENT-PII***>
Thales Andrade Pereira <${NOREPLY_EMAIL}> <thalespereira@MacBook-Pro-de-Thales.local>
Thales Andrade Pereira <${NOREPLY_EMAIL}> <thalespereira@macbook-pro-de-thales.local>
EOF

echo "[history-sanitize] Rewriting history across ${BEFORE_BRANCH_COUNT} branches and ${BEFORE_TAG_COUNT} tags..."
git filter-repo   --force   --invert-paths   --paths-from-file /tmp/recipient-paths.txt   --replace-text /tmp/replacements.txt   --replace-message /tmp/replacements.txt   --mailmap /tmp/mailmap

# filter-repo intentionally removes origin. Restore it without embedding credentials in the URL.
git remote remove origin >/dev/null 2>&1 || true
git remote add origin "$REMOTE_URL"

AFTER_BRANCH_COUNT="$(git for-each-ref --format='%(refname)' refs/heads | wc -l | tr -d ' ')"
AFTER_TAG_COUNT="$(git for-each-ref --format='%(refname)' refs/tags | wc -l | tr -d ' ')"
[[ "$AFTER_BRANCH_COUNT" == "$BEFORE_BRANCH_COUNT" ]] || fail "Branch count changed during rewrite."
[[ "$AFTER_TAG_COUNT" == "$BEFORE_TAG_COUNT" ]] || fail "Tag count changed during rewrite."

git for-each-ref --format='%(refname)' refs/heads | sort > /tmp/branches-after.txt
git for-each-ref --format='%(refname)' refs/tags | sort > /tmp/tags-after.txt
cmp -s /tmp/branches-before.txt /tmp/branches-after.txt || fail "Branch names changed during rewrite."
cmp -s /tmp/tags-before.txt /tmp/tags-after.txt || fail "Tag names changed during rewrite."

# Current published artifacts must remain byte-identical.
find docs -type f -print0 | sort -z | xargs -0 sha256sum > /tmp/docs-after.sha256
cmp -s /tmp/docs-before.sha256 /tmp/docs-after.sha256 || fail "Published docs changed during history rewrite."

# recipients.txt must be absent from every rewritten branch/tag history.
if git log --all --name-only --pretty=format: |
  sed '/^$/d' |
  grep -Eq '(^|/)recipients\.txt$'; then
  fail "A recipients.txt path is still reachable after rewrite."
fi

# Known recipient addresses must not remain in commit/tag messages or historical blobs.
REV_LIST_FILE=/tmp/revisions.txt
git rev-list --all > "$REV_LIST_FILE"
while IFS= read -r email; do
  if git log --all --format='%B' | grep -Fqi -- "$email"; then
    fail "Recipient PII remains in commit/tag messages."
  fi

  found=0
  while IFS= read -r commit; do
    if git grep -I -q -F -- "$email" "$commit" -- . 2>/dev/null; then
      found=1
      break
    fi
  done < "$REV_LIST_FILE"
  [[ "$found" -eq 0 ]] || fail "Recipient PII remains in a historical blob."
done < /tmp/recipient-emails.txt

rollback_remote() {
  echo "::error::Post-push verification failed. Attempting atomic rollback to the pre-sanitize refs."
  rm -rf /tmp/rollback.git
  git clone --mirror /tmp/pre-sanitize.bundle /tmp/rollback.git >/dev/null 2>&1 || return 1
  (
    cd /tmp/rollback.git
    git remote add github "$REMOTE_URL"
    git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic ${AUTH_HEADER}"       push --atomic --force github       'refs/heads/*:refs/heads/*'       'refs/tags/*:refs/tags/*'
  )
}

echo "[history-sanitize] Atomically replacing all public branch and tag refs..."
git_auth push --atomic --force origin   'refs/heads/*:refs/heads/*'   'refs/tags/*:refs/tags/*'

echo "[history-sanitize] Performing fresh-clone verification..."
rm -rf /tmp/post-sanitize.git /tmp/post-sanitize-work
if ! git_auth clone --mirror "$REMOTE_URL" /tmp/post-sanitize.git >/dev/null 2>&1; then
  rollback_remote || true
  fail "Fresh mirror clone failed after push."
fi

POST_BRANCH_COUNT="$(git --git-dir=/tmp/post-sanitize.git for-each-ref --format='%(refname)' refs/heads | wc -l | tr -d ' ')"
POST_TAG_COUNT="$(git --git-dir=/tmp/post-sanitize.git for-each-ref --format='%(refname)' refs/tags | wc -l | tr -d ' ')"
if [[ "$POST_BRANCH_COUNT" != "$BEFORE_BRANCH_COUNT" || "$POST_TAG_COUNT" != "$BEFORE_TAG_COUNT" ]]; then
  rollback_remote || true
  fail "Remote ref counts do not match the pre-rewrite inventory."
fi

if git --git-dir=/tmp/post-sanitize.git log --all --name-only --pretty=format: |
  sed '/^$/d' |
  grep -Eq '(^|/)recipients\.txt$'; then
  rollback_remote || true
  fail "Remote history still exposes recipients.txt."
fi

while IFS= read -r email; do
  if git --git-dir=/tmp/post-sanitize.git log --all --format='%B' | grep -Fqi -- "$email"; then
    rollback_remote || true
    fail "Remote commit/tag messages still expose recipient PII."
  fi
done < /tmp/recipient-emails.txt

if ! git_auth clone --depth 1 --branch main "$REMOTE_URL" /tmp/post-sanitize-work >/dev/null 2>&1; then
  rollback_remote || true
  fail "Fresh main clone failed after push."
fi

(
  cd /tmp/post-sanitize-work
  find docs -type f -print0 | sort -z | xargs -0 sha256sum > /tmp/docs-remote.sha256
)
if ! cmp -s /tmp/docs-before.sha256 /tmp/docs-remote.sha256; then
  rollback_remote || true
  fail "Remote published docs are not byte-identical after rewrite."
fi

echo "[history-sanitize] SUCCESS"
echo "[history-sanitize] Historical recipient paths removed: ${RECIPIENT_PATH_COUNT}"
echo "[history-sanitize] Historical recipient addresses sanitized: ${RECIPIENT_EMAIL_COUNT}"
echo "[history-sanitize] Branch refs preserved: ${BEFORE_BRANCH_COUNT}"
echo "[history-sanitize] Tag refs preserved: ${BEFORE_TAG_COUNT}"
echo "[history-sanitize] Current docs artifacts preserved byte-for-byte: ${DOC_COUNT}"

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "## History sanitization completed"
    echo
    echo "- Branch refs preserved: **${BEFORE_BRANCH_COUNT}**"
    echo "- Tag refs preserved: **${BEFORE_TAG_COUNT}**"
    echo "- Historical recipient paths removed: **${RECIPIENT_PATH_COUNT}**"
    echo "- Historical recipient addresses sanitized: **${RECIPIENT_EMAIL_COUNT}**"
    echo "- Current `docs/` artifacts preserved byte-for-byte: **${DOC_COUNT}**"
    echo "- Fresh-clone verification: **PASS**"
    echo
    echo "> GitHub pull-request refs/caches are server-managed and require GitHub Support for complete dereferencing after a sensitive-data rewrite."
  } >> "$GITHUB_STEP_SUMMARY"
fi
