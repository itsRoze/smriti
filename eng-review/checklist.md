# `/eng-review` checklist

Read this before reviewing a diff. The checklist is the rules — `/eng-review` is only as good as what's here.

## How to use it

1. Get the diff (`git diff origin/<base>`).
2. Run **Pass 1 (CRITICAL)** against every changed file.
3. Run **Pass 2 (INFORMATIONAL)** against every changed file.
4. For each finding, classify as `AUTO-FIX` (mechanical, safe — apply silently) or `ASK` (judgment required — batch into one AskUserQuestion).
5. Be terse. One line for the problem, one line for the fix. No "looks good overall" filler.
6. **Skip anything that's actually fine.** False positives erode trust faster than missed bugs.

## Output format

```
/eng-review: N issues (X critical, Y informational)

AUTO-FIXED:
- [file:line] Problem → fix applied

NEEDS INPUT:
- [file:line] Problem
  Suggested fix: <fix>
```

If clean: `/eng-review: no issues found.`

---

# Pass 1 — CRITICAL

## SQL safety

**Flag:**
- String interpolation / template literals inside SQL (`\`SELECT ... WHERE id = ${id}\``). Use parameterized queries (`pg`/`postgres`: `$1`/`$2`; Prisma: `Prisma.sql\`\``; SQLAlchemy: bound params; raw `sqlite3`: `?` placeholders).
- Raw user input (or LLM output) reaching `WHERE` / `ORDER BY` / `LIMIT` clauses without an allowlist.
- Direct ORM bypass (Prisma `$queryRawUnsafe`, Django `QuerySet.extra(where=)`, SQLAlchemy `text()` with f-string) when a parameterized form would work.

**Skip when:**
- The interpolated value is a compile-time constant or comes from an enum allowlist that's verified by the type system.
- It's a migration / one-off seed script (still flag, but lower confidence).

## Race conditions / concurrency

**Flag:**
- Check-then-act patterns (`if (await exists(x)) await create(x)`) without a unique constraint or upsert. Concurrent calls double-create.
- Status transitions written as `read → mutate → write` without `WHERE old_status = ?` or compare-and-swap.
- Shared mutable module-level state in code that runs in parallel (workers, async handlers).
- `find-or-create` without a DB-level unique index on the lookup column.

**Skip when:**
- The code path provably runs single-threaded (CLI tool with no concurrency, build script).
- A unique constraint is named in the migration history and the violation is caught + retried.

## LLM trust boundary

**Flag:**
- LLM output (model response, tool args, JSON output) written to DB or passed to mailers/API calls without **schema validation** (Zod / Pydantic / JSON Schema).
- LLM-generated strings inserted into HTML without escaping (`dangerouslySetInnerHTML`, `v-html`, `{{{...}}}`, Django `|safe`).
- LLM-generated URLs fetched without an allowlist — SSRF risk if it points to internal services or `file://`.
- LLM output stored in vector DBs / knowledge bases without sanitization (stored prompt-injection risk).
- Tool output (function-call args) used as control flow without a switch/match exhaustiveness check.

**Skip when:**
- The output is rendered through a templating engine that auto-escapes (React JSX without `dangerouslySetInnerHTML`, properly-templated Liquid/Handlebars).
- It's a one-shot dev tool where the user is the only "user."

## Shell injection

**Flag:**
- `child_process.exec` / `child_process.execSync` / Bun `Bun.$` / `os.system()` / `subprocess.run(..., shell=True)` with **any** interpolated variable.
- Backticks in shell scripts containing variables that aren't quoted.
- `eval` / `exec` / `Function()` on data that came from user input or LLM output.

**Always-safe alternatives:**
- Node: `spawn(cmd, [arg1, arg2])` (argv array, no shell).
- Python: `subprocess.run([cmd, arg1, arg2], shell=False)`.
- Bash: always quote `"$VAR"`.

**Skip when:**
- The command and all args are compile-time string literals.

## Enum / discriminated-union completeness

When the diff adds a new enum value, status string, tier name, type discriminator:

**Flag:**
- Switch / match statements that don't handle the new value (TS: missing case + no `never` exhaustiveness check; Rust: missing arm; Python: `match` without `case _`).
- Allowlists / `%w[]` arrays containing sibling values that haven't been updated.
- Display layers (frontend dropdowns, formatters) where the new value will render as raw text or break.

**Verification:** grep for at least one *sibling* value (existing enum members) and read every match — the consumers of the old value are exactly the consumers that need updating for the new value.

**Skip when:**
- The new value is internal-only and provably never exposed to UI / serialization.

## Secret leakage

**Flag:**
- Hardcoded API keys, tokens, or passwords (anything matching `(api[_-]?key|token|secret|password|bearer)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}`).
- Secrets in logs (`console.log({ user, password })`, `print(env)` of full env dict).
- `.env`, `*.pem`, `*.key`, `service-account.json` in the diff (especially in `git status` → "added").
- Secrets baked into Docker / CI files.

**Skip when:**
- The "secret" is a public publishable key (Supabase anon key, Firebase config, Stripe `pk_live_*`).
- It's an example file with placeholder values like `sk_test_REPLACE_ME`.

## Unhandled errors

**Flag:**
- Bare `try { ... } catch {}` (silently swallows).
- Promises with no `.catch()` and no surrounding `try/await` (`unhandledRejection` risk).
- Async functions called without `await` where the caller depends on the result.
- Errors `console.error`'d but not surfaced to the user / monitoring (silent failure).

**Skip when:**
- The catch is intentional with a comment explaining why (`// best-effort logging; ignore failures`).
- The promise is fire-and-forget by design (analytics, prefetch).

---

# Pass 2 — INFORMATIONAL

## Validation at boundaries only

**Flag:**
- Re-validating data that's already been validated upstream (defensive paranoia in internal calls).
- Trusting external input *without* validation at the system boundary (HTTP handler, CLI arg parser, message-queue consumer).

**Rule:** validate *once*, at the boundary. Internal callers trust each other.

**Skip when:**
- The "redundant" validation is actually a different invariant being checked (auth + rate-limit + business rule are not redundant).

## N+1 queries

**Flag:**
- Loop over query results that fires another query per row (Prisma without `include`, SQLAlchemy without `joinedload`, Django without `select_related`/`prefetch_related`).
- `for user in users: await loadProfile(user.id)` — should be a single batched query.

**Skip when:**
- The outer collection is bounded to ≤ a handful (`users.length === 1` case, dev-only debug code).

## Missing indexes

**Flag:**
- New `WHERE` / `ORDER BY` / `JOIN` columns on hot paths without a corresponding migration adding an index.
- Composite queries that could use a multi-column index but use single-column ones.

**Skip when:**
- The table is provably small (lookup table, < 1000 rows, growth bounded).

## Async / sync mixing

**Flag:**
- Sync I/O inside `async def` (Python): `time.sleep` instead of `asyncio.sleep`; `requests.get` instead of `httpx.AsyncClient`; sync `open` instead of `aiofiles`.
- Node: `fs.readFileSync` / `fs.writeFileSync` in request handlers — blocks the event loop.
- Awaiting in a `for` loop where `Promise.all` would parallelize safely.

**Skip when:**
- The sync call is rare and the alternative would meaningfully complicate the code (e.g., reading a config once at startup).

## LLM prompt issues

**Flag:**
- 0-indexed lists in prompts (LLMs reliably return 1-indexed; off-by-one bugs).
- Word / token limits stated in multiple places that can drift.
- Prompt text describing tools / capabilities that don't match the actual `tools` array wired up.
- "Important:" or "MUST" repeated > 3 times in a single prompt (signal of a prompt that needs restructuring, not louder yelling).

**Skip when:**
- The prompt is throwaway / experimental and not on a production code path.

## Type coercion at boundaries

**Flag:**
- Values crossing JSON / form / URL boundaries where a number becomes a string (or vice versa) silently.
- `===` comparisons on values that may have been deserialized as different types.
- Hash / digest inputs that don't normalize types — same-meaning data hashes differently.

**Skip when:**
- The boundary has explicit Zod / Pydantic / Valibot parsing that coerces.

## Completeness gaps

**Flag:**
- Shortcut implementations where the complete version costs less than 30 min of Claude time (per the {{COMPLETENESS_RUBRIC}}).
- Options presented to the user with only one effort axis (should show human + Claude time).
- Test coverage gaps where adding the missing tests mirrors the structure of existing happy-path tests.
- Features at 80–90% when 100% is achievable with modest additional code.

**Skip when:**
- The user explicitly chose a lower-completeness option (`/office-hours` Phase 5 captured this).
- `LEAN=prototype` in `smriti-config` and the gap is in non-critical code.

## Documentation staleness

**Flag:**
- The diff changes a public API / CLI flag / env var, but `README.md` / `PROJECT.md` / `DESIGN.md` / `CLAUDE.md` references the old form.
- A function rename in code without a corresponding rename in inline doc comments.

**Skip when:**
- The change is internal-only and not user-facing.

## Confidence calibration

When you're not 100% sure a finding is real, **say so** in the prose:

- *"Likely safe — the value is normalized upstream by `parseSearchParams`, but I haven't traced every caller."*
- *"Verified — grep'd all callers; this is the only one."*
- *"Speculation — this pattern *could* deadlock under high concurrency; I haven't tested."*

Never invent a finding to seem thorough. False positives are worse than misses.

---

## Categories deliberately excluded from this checklist

These are real concerns but live elsewhere:

- **Design / UI quality** → `/design-review`
- **Architecture-level decisions** → `/plan-eng-review`
- **Performance benchmarking** → not in v1
- **Test coverage analysis** → `/create-pr` runs the coverage audit
