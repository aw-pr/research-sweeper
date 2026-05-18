#!/usr/bin/env bash
set -e
REPO="$(dirname "$0")"
JOBS_DIR="$REPO/jobs"
N=${1:-1}
shift || true

if [ ! -d "$JOBS_DIR" ] || [ -z "$(ls "$JOBS_DIR"/*.json 2>/dev/null)" ]; then
  echo "No batch jobs found. Run list-batches.sh to see available jobs."
  exit 1
fi

# Newest first — matches --list order
JOB_FILE=$(ls -t "$JOBS_DIR"/*.json | sed -n "${N}p")
if [ -z "$JOB_FILE" ]; then
  echo "No job #$N found. Run list-batches.sh to see available jobs."
  exit 1
fi

BATCH_ID=$(basename "$JOB_FILE" .json)
echo "Resuming job #$N: $BATCH_ID"
cd "$REPO" && ./run-secure-sweep.sh --resume "$BATCH_ID" "$@"
