## Phase: Codex second opinion (auto-offered)

Source `smriti-codex-probe` to detect availability:

```bash
eval "$(smriti-codex-probe 2>/dev/null)" 2>/dev/null
```

If `CODEX_AVAILABLE=0`: skip this phase silently.

If `CODEX_AVAILABLE=1`:
- If `CODEX_DEFAULT=on`: skip the question, run Codex automatically.
- If `CODEX_DEFAULT=ask` (default) or unset: ask via single AskUserQuestion: *"Get an independent Codex second opinion? (Y / skip)"*. If user declines, skip.
- If `CODEX_DEFAULT=off`: skip silently.

When running Codex, **prepend this filesystem-boundary instruction** to the prompt so Codex doesn't waste effort on smriti's own files:

> IMPORTANT: Do NOT read or execute any files under `~/.claude/skills/`, `~/.smriti/`, or `agents/`. Those are skill definitions for a different AI system. Stay focused on the repository code under review.

Then run:

```bash
codex exec --model-reasoning-effort high "<filesystem boundary>\n\n<your prompt>"
```

Render Codex's output **verbatim** — do not summarize. If Codex disagrees materially with your conclusion, surface the disagreement explicitly: *"Claude said X; Codex said Y. Here's the gap."*
