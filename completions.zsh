# Research Sweeper — Zsh completions (Oh My Zsh compatible)
# Add to ~/.zshrc:
#   source ~/repos/research-sweeper/completions.zsh

# Capture the repo directory at source time
_RESEARCH_SWEEPER_DIR="${${(%):-%x}:h}"

# batch-search.sh — all flags match research-sweep.ts CLI
_batch_search_completion() {
  _arguments \
    '--brief-file[Markdown brief file]:brief_file:_files' \
    '--topic[Research topic]:topic:' \
    '--from[Start year]:year:' \
    '--to[End year]:year:' \
    '--provider[Model provider]:provider:(claude openai)' \
    '--depth[Search depth]:depth:(shallow standard deep)' \
    '--lanes[Source lanes (comma-separated)]:lanes:(financial frontier academic vc blogs tech)' \
    '--folder[Output folder name under ~/obsidian/research/]:folder:' \
    '--overwrite[Replace an existing summary/sources set for the same topic slug]' \
    '--test[Use lower-cost models for testing]' \
    '--no-search[Disable web_search tool — model-knowledge only]' \
    '--lane-model[Override lane model]:lane_model:(haiku sonnet)' \
    '--synthesis-model[Override synthesis model]:synthesis_model:' \
    '--claude-auth[Claude credential route (sync-only for claude-cli)]:claude_auth:(api-key claude-cli)'
}
compdef _batch_search_completion batch-search.sh

# resume-batch.sh — complete job number based on jobs/ directory count
_resume_batch_completion() {
  local count
  count=$(ls "$_RESEARCH_SWEEPER_DIR/jobs/"*.json 2>/dev/null | wc -l | tr -d ' ')
  local -a nums
  for ((i = 1; i <= count; i++)); do
    nums+=($i)
  done
  _arguments "1:job number:(${nums[*]})"
}
compdef _resume_batch_completion resume-batch.sh
