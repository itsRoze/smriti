## Logging learnings (run before completion)

If during this skill you observed a non-obvious pattern, pitfall, preference, architectural choice, tool quirk, or operational fact about this project — log it so future smriti runs can recall it:

```bash
smriti learnings-log \
  --skill <skill-name> \
  --type <pattern|pitfall|preference|architecture|tool|operational> \
  --key <kebab-key> \
  --insight "one sentence about the learning" \
  --confidence <1-10> \
  --source <observed|user-stated|inferred>
```

**When to log:**
- `user-stated` — the user explicitly told you the fact (highest trust; never decays)
- `observed` — you saw it directly in the code (decays over time)
- `inferred` — you concluded it from context (decays; lowest trust)

**When NOT to log:**
- Transient state (current branch, in-progress work) — that belongs in TODOS.md
- Things derivable from the code right now (architecture, conventions) — re-derive on demand
- Anything already documented in CLAUDE.md or PROJECT.md

To supersede an existing learning: use the same `key` + `type` and the new entry wins at read time.
