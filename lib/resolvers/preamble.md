## Preamble (run first)

```bash
# Update check (silent unless behind; throttled to once per hour)
smriti-update-check 2>/dev/null || true

# Slug + first-time-in-codebase detection
eval "$(smriti-slug 2>/dev/null)" 2>/dev/null
SLUG="${SLUG:-unknown}"
IS_FIRST_TIME="${IS_FIRST_TIME:-no}"
BRANCH=$(git branch --show-current 2>/dev/null || echo unknown)
# Filename-safe form (slashes break path globbing + create unintended subdirs).
# Use BRANCH for git/display, BRANCH_SLUG when interpolating into file paths.
BRANCH_SLUG="${BRANCH//\//--}"

# Config
LEAN=$(smriti-config get lean 2>/dev/null || echo senior)
CODEX_DEFAULT=$(smriti-config get codex_default 2>/dev/null || echo ask)
EXPLAIN_LEVEL=$(smriti-config get explain_level 2>/dev/null || echo default)
PROACTIVE=$(smriti-config get proactive 2>/dev/null || echo true)

# Codex availability (sets CODEX_AVAILABLE, CODEX_AUTH, CODEX_VERSION)
eval "$(smriti-codex-probe 2>/dev/null)" 2>/dev/null
CODEX_AVAILABLE="${CODEX_AVAILABLE:-0}"

# Per-repo artifacts
HAS_PROJECT_DOC=no; [ -f PROJECT.md ] && HAS_PROJECT_DOC=yes
HAS_DESIGN_DOC=no;  [ -f DESIGN.md ]  && HAS_DESIGN_DOC=yes
HAS_TODOS=no;       [ -f TODOS.md ]   && HAS_TODOS=yes

# Echo session state
echo "SLUG: $SLUG"
echo "BRANCH: $BRANCH"
echo "IS_FIRST_TIME: $IS_FIRST_TIME"
echo "LEAN: $LEAN"
echo "CODEX: available=$CODEX_AVAILABLE default=$CODEX_DEFAULT"
echo "DOCS: project=$HAS_PROJECT_DOC design=$HAS_DESIGN_DOC todos=$HAS_TODOS"

# Surface top relevant prior learnings (if any)
LEARNINGS_FILE="${SMRITI_HOME:-$HOME/.smriti}/projects/$SLUG/learnings.jsonl"
if [ -f "$LEARNINGS_FILE" ]; then
  COUNT=$(wc -l < "$LEARNINGS_FILE" | tr -d ' ')
  echo "LEARNINGS: $COUNT entries"
  [ "$COUNT" -gt 0 ] && smriti-learnings-search --limit 3 --format text 2>/dev/null || true
else
  echo "LEARNINGS: 0"
fi
```

**After the preamble runs, every skill body has these vars available:**

| Var | Meaning |
|-----|---------|
| `SLUG` | Per-project identity (cached). |
| `BRANCH` | Current git branch. |
| `BRANCH_SLUG` | Filename-safe form of `BRANCH` (slashes → `--`). Use for paths. |
| `IS_FIRST_TIME` | `yes` if this is the first smriti run in this repo. |
| `LEAN` | `senior` or `prototype`. Skills should honor this. |
| `CODEX_AVAILABLE` | `1` if Codex CLI is installed and authed. |
| `CODEX_DEFAULT` | `on` / `ask` / `off`. |
| `HAS_PROJECT_DOC` / `HAS_DESIGN_DOC` / `HAS_TODOS` | `yes` / `no`. |
