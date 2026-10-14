#!/usr/bin/env bash
# Εγκαθιστά μόνο τους workers που έχουν secret. Όσοι λείπουν, παραλείπονται: ο orchestrator
# τους βλέπει ως «not_installed» και πάει στον fallback ή σταματά καθαρά το βήμα.
set -euo pipefail

if [[ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]]; then
  npm install -g @anthropic-ai/claude-code
  echo "✓ claude"
else
  echo "– claude: δεν υπάρχει CLAUDE_CODE_OAUTH_TOKEN"
fi
if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  npm install -g @openai/codex
  echo "✓ codex"
else
  echo "– codex: δεν υπάρχει OPENAI_API_KEY"
fi
if [[ -n "${GEMINI_API_KEY:-}" ]]; then
  npm install -g @google/gemini-cli
  echo "✓ gemini"
else
  echo "– gemini: δεν υπάρχει GEMINI_API_KEY"
fi
