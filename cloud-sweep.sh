#!/usr/bin/env bash
# Run a research sweep inside a Claude Code cloud session and carry the result
# out on a git branch, because the sandbox and its files vanish when the
# session ends.
#
#   ./cloud-sweep.sh --brief-file prompts/x.md --folder my-topic [--lanes ...] [--depth ...] [--from ...]
#   ./cloud-sweep.sh --stage prompts/x.md --folder my-topic   # locally: put the brief on branch sweeps/my-topic and push
#   ./cloud-sweep.sh --collect my-topic                     # locally: fetch the branch and copy into the vault
#
# Cloud run: sync sweep on the Claude subscription route (set
# SWEEP_CLAUDE_OAUTH_TOKEN in the cloud environment; it is mapped to
# CLAUDE_CODE_OAUTH_TOKEN, which the runtime filters out), output under sweeps/<folder>, committed
# on branch sweeps/<folder> and pushed to origin. The sweep never writes to
# the branch the session started on.
#
# Collect: fetches origin/sweeps/<folder>, copies sweeps/<folder> into
# RESEARCH_SWEEPER_OUTPUT_DIR (env, else .env.local, else .env), and leaves
# the branch in place for review.
#
# Stage: prompts/ is gitignored (a brief is operator activity), so the brief
# travels on the sweep branch: --stage force-adds it on sweeps/<folder> cut from
# the current HEAD, pushes, and returns. The cloud session then checks out that
# branch and runs the sweep, which commits on the same branch.
#
# Flags of its own: --stage <brief>, --collect <folder>, --into <dir>, --no-push, --dry-run.
# Everything else is passed to research-sweep.ts unchanged.
set -euo pipefail
cd "$(dirname "$0")"

usage() { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

collect="" stage="" into="" push=1 dry=0 folder=""
passthrough=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --collect) collect="$2"; shift 2 ;;
    --stage) stage="$2"; shift 2 ;;
    --into) into="$2"; shift 2 ;;
    --no-push) push=0; shift ;;
    --dry-run) dry=1; shift ;;
    --folder) folder="$2"; passthrough+=("$1" "$2"); shift 2 ;;
    -h|--help) usage ;;
    *) passthrough+=("$1"); shift ;;
  esac
done

env_value() {
  local key="$1" file
  if [[ -n "${!key:-}" ]]; then printf '%s' "${!key}"; return 0; fi
  for file in .env.local .env; do
    [[ -f "$file" ]] || continue
    local line
    line="$(grep -E "^${key}=" "$file" | head -n1 || true)"
    if [[ -n "$line" ]]; then printf '%s' "${line#*=}"; return 0; fi
  done
  return 1
}

run() { if (( dry )); then printf '+ %s\n' "$*"; else "$@"; fi; }

if [[ -n "$collect" ]]; then
  branch="sweeps/${collect}"
  [[ -n "$into" ]] || into="$(env_value RESEARCH_SWEEPER_OUTPUT_DIR || true)"
  if [[ -z "$into" ]]; then
    echo "cloud-sweep: no destination; pass --into <dir> or set RESEARCH_SWEEPER_OUTPUT_DIR" >&2
    exit 2
  fi
  into="${into/#\~/$HOME}"
  run git fetch origin "$branch"
  run mkdir -p "$into"
  run rm -rf "${into}/${collect}"
  # git archive reads the branch without touching this checkout's index or
  # tree; strip the sweeps/ prefix so the folder lands directly in the vault.
  if (( dry )); then
    printf '+ git archive origin/%s sweeps/%s | tar -x -C %s --strip-components=1\n' "$branch" "$collect" "$into"
  else
    git archive "origin/${branch}" "sweeps/${collect}" | tar -x -C "$into" --strip-components=1
  fi
  echo "cloud-sweep: ${collect} collected into ${into}/${collect}"
  exit 0
fi

if [[ -z "$folder" ]]; then
  echo "cloud-sweep: --folder is required so the result has a branch to ride" >&2
  exit 2
fi

if [[ -n "$stage" ]]; then
  branch="sweeps/${folder}"
  start_branch="$(git rev-parse --abbrev-ref HEAD)"
  run git checkout -B "$branch"
  run git add -f "$stage"
  run git commit -m "sweep(${folder}): stage the brief for a cloud session"
  (( push == 0 )) || run git push -u origin "$branch"
  run git checkout "$start_branch"
  echo "cloud-sweep: brief staged on ${branch}; point the cloud session at that branch"
  exit 0
fi
# The cloud runtime keeps CLAUDE_CODE_* names for its own auth, so an
# environment variable under that name never reaches the session shell.
# Accept SWEEP_CLAUDE_OAUTH_TOKEN and map it across for the Agent SDK.
if [[ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" && -n "${SWEEP_CLAUDE_OAUTH_TOKEN:-}" ]]; then
  export CLAUDE_CODE_OAUTH_TOKEN="$SWEEP_CLAUDE_OAUTH_TOKEN"
fi
if [[ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" && $dry -eq 0 ]]; then
  echo "cloud-sweep: no Claude OAuth token; set SWEEP_CLAUDE_OAUTH_TOKEN in the cloud environment (CLAUDE_CODE_OAUTH_TOKEN is filtered there)" >&2
  exit 2
fi

# The cloud container runs as root, and Claude Code refuses bypassPermissions
# under root unless it is told it is inside a sandbox. The Agent SDK lanes use
# that mode, so set the documented container escape hatch when we are root.
if [[ "$(id -u)" == "0" ]]; then
  export IS_SANDBOX=1
fi

branch="sweeps/${folder}"
start_branch="$(git rev-parse --abbrev-ref HEAD)"
export RESEARCH_SWEEPER_OUTPUT_DIR="${RESEARCH_SWEEPER_OUTPUT_DIR:-$PWD/sweeps}"

run npx ts-node research-sweep.ts --sync --provider claude --claude-auth claude-oauth "${passthrough[@]}"

[[ "$start_branch" == "$branch" ]] || run git checkout -B "$branch"
run git add -f "sweeps/${folder}"
author_flag=()
[[ -z "${SWEEP_COMMIT_AUTHOR:-}" ]] || author_flag=(--author="$SWEEP_COMMIT_AUTHOR")
run git commit ${author_flag[@]+"${author_flag[@]}"} -m "sweep(${folder}): results from a cloud session"
if (( push )); then
  # A clone made by `claude --cloud` can arrive with no remotes at all. The
  # cloud environment can name the repo through SWEEP_REMOTE_URL (an https
  # GitHub URL; the session's GitHub proxy supplies the credentials).
  if ! git remote get-url origin >/dev/null 2>&1; then
    if [[ -n "${SWEEP_REMOTE_URL:-}" ]]; then
      run git remote add origin "$SWEEP_REMOTE_URL"
    else
      echo "cloud-sweep: results are committed on ${branch} but this clone has no origin; set SWEEP_REMOTE_URL=https://github.com/<owner>/<repo>.git in the cloud environment, or add the remote and push by hand" >&2
      exit 3
    fi
  fi
  run git push -u origin "$branch"
fi
[[ "$start_branch" == "$branch" ]] || run git checkout "$start_branch"
echo "cloud-sweep: results on branch ${branch}; locally run ./cloud-sweep.sh --collect ${folder}"
