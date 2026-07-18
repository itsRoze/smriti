## Phase: Codex second opinion (autonomous)

Source `smriti codex-probe` to detect availability:

```bash
eval "$(smriti codex-probe 2>/dev/null)" 2>/dev/null
```

If `CODEX_AVAILABLE=0`: skip this phase silently.

If `CODEX_AVAILABLE=1`:
- If `CODEX_DEFAULT=on`: run Codex automatically.
- If `CODEX_DEFAULT=auto` (default), `ask` (legacy alias for `auto`), or unset: **decide yourself — never ask the user.** Default to running Codex; skip it only when the change under review is genuinely small *and* straightforward. Skip when ALL of these hold:
  - the substance fits in a handful of lines (~≤30 changed lines, or a plan with a single obvious step),
  - it's mechanical or self-evidently correct (docs/comments/copy, config value flips, renames, dependency bumps, formatting), and
  - it touches no logic, control flow, concurrency, security surface, or public interface.

  Anything with real design or correctness surface — new logic, refactors, bug-fix root-cause reasoning, multi-file plans, schema or API changes — gets the Codex pass. When uncertain, run it. When you skip, say so in one line with the reason (e.g., *"Skipping Codex review: comment-only change."*) and move on — do not ask for confirmation either way.
- If `CODEX_DEFAULT=off`: skip silently.

When running Codex, **prepend this filesystem-boundary instruction** to the prompt so Codex doesn't waste effort on smriti's own files:

> IMPORTANT: Do NOT read or execute any files under `~/.claude/skills/`, `~/.smriti/`, or `agents/`. Those are skill definitions for a different AI system. Stay focused on the repository code under review.

Then run:

```bash
codex exec "<filesystem boundary>\n\n<your prompt>"
```

The legacy `--model-reasoning-effort` flag was removed in codex 0.114.0; reasoning effort is now controlled via `~/.codex/config.toml` (or `-c model_reasoning_effort=high` per invocation) when the user wants to deviate from their default.

Render Codex's output **verbatim** — do not summarize. If Codex disagrees materially with your conclusion, surface the disagreement explicitly: *"Claude said X; Codex said Y. Here's the gap."*
