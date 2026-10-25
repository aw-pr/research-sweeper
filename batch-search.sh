#!/usr/bin/env bash
# Submit a research sweep as a batch job (processes async at 50% token cost).
# All flags are optional — omit any to be prompted interactively.
#
# Waiting is opt-in; neither flag below is the default:
#   --wait      wait for this job, then auto-resume it (default synthesis, API key)
#   --wait-all  wait for every pending job in jobs/, auto-resuming each as it ends
# Without either, the job is submitted and the CLI prints the resume command,
# so synthesis can run later on a different route (e.g. a subscription).
#
# Examples:
#   ./batch-search.sh
#   ./batch-search.sh --topic "AI observability" --depth deep --folder observability
#   ./batch-search.sh --topic "..." --lanes financial,frontier,academic,vc,blogs,tech --depth standard --folder my-research
#   ./batch-search.sh --wait --topic "..." --folder my-research   # submit and auto-resume when done
cd "$(dirname "$0")" && ./run-secure-sweep.sh --batch "$@"
