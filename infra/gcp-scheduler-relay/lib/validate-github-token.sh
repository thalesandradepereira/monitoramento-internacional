#!/usr/bin/env bash

validate_github_dispatch_token() {
  local token="${1:-}"

  if [[ -z "$token" ]]; then
    echo "GITHUB_DISPATCH_TOKEN is required." >&2
    return 1
  fi

  if [[ "$token" =~ [[:space:]] ]]; then
    echo "GITHUB_DISPATCH_TOKEN contains whitespace; copy the token again without spaces or line breaks." >&2
    return 1
  fi

  if [[ "$token" == github_pat_*github_pat_* ]]; then
    echo "GITHUB_DISPATCH_TOKEN appears duplicated; paste the fine-grained token exactly once." >&2
    return 1
  fi

  if [[ "$token" != github_pat_* ]]; then
    echo "GITHUB_DISPATCH_TOKEN must be a GitHub fine-grained personal access token (github_pat_...). " >&2
    return 1
  fi

  return 0
}
