## Interactive HTML review loop

When a review surfaces **multiple findings** — the whole output is N decisions —
present them as one interactive HTML view the user triages in the browser,
instead of N serial AskUserQuestion prompts. The user accepts / rejects / edits
each finding and adds free-form notes; you read the structured result, revise,
re-render, and repeat until they finish.

**HTML is mandatory for N findings.** A single-decision skill keeps
AskUserQuestion; a **multi-finding** review does not get that choice — once the
output is N decisions, the interactive HTML loop is required, not one option among
several. Do NOT collapse N findings into a single AskUserQuestion (or a serial
run of them) because it feels quicker. The decision-brief content (ELI10 / Stakes
/ Recommendation / pros-cons) is exactly what fills each card's `body_md`; HTML is
a new *presentation* of that format, not a new format.

**Markdown stays the source of truth.** The spec is a generated view of your
findings; persist decisions back to the markdown doc as usual.

### The loop

1. **Build the spec** — map findings → sections → cards. Give every card a
   **stable id** you reuse across re-renders (see *Finding identity* below).
   Compute `source_hash` over the doc you're reviewing. Set `session_id` to any
   placeholder — `serve` assigns the real one.
2. **serve** — `smriti html serve <spec.json>` starts the server, opens the
   browser, and prints one JSON line `{"session_id","port","url"}`. **Capture
   `session_id`** — every later call passes it (explicit, no implicit "current
   session", so concurrent loops never collide).
3. **await** — `smriti html await --session <id>` blocks until the user submits,
   then prints the decision payload JSON to stdout. Read it.
4. **Apply + revise** — apply each card's accept/reject deterministically; read
   `notes` / `global_notes` as conversation that shapes the next revision. Update
   your markdown. If `action` is `finish`, leave the loop.
5. **render** — `smriti html render --session <id> <next-spec.json>` swaps the
   content and bumps `revision_id`; the open tab live-reloads. Go to step 3.
6. **stop** — `smriti html stop --session <id>` when the loop ends.

### Spec (what you send)

The canonical schema lives in `bin/smriti-html` (TypeScript). **If this table and
the code ever disagree, the code wins** — this is a mirror for convenience.

| field | type | notes |
|---|---|---|
| `title` | string | view heading |
| `skill` | string | calling skill, e.g. `plan-eng-review` |
| `session_id` | string | placeholder; `serve` overwrites it |
| `revision_id` | string | bump on every `render` (`rev-1`, `rev-2`, …) |
| `source_hash` | string | hash of the reviewed doc (staleness guard) |
| `sections[]` | array | `{ id, title, cards[] }` |
| `cards[]` | array | `{ id, title, body_md, status?, default_decision? }` |
| `card.status` | `open` \| `resolved` \| `new` | optional, default `open` |
| `card.default_decision` | `accept` \| `reject` \| `edit` | optional pre-selection |
| `global_notes_prompt` | string | optional; placeholder for the overall-notes box |

<!-- example:spec -->
```json
{
  "title": "Plan review — interactive HTML specs",
  "skill": "plan-eng-review",
  "session_id": "pending",
  "revision_id": "rev-1",
  "source_hash": "9f2c1a",
  "sections": [
    {
      "id": "architecture",
      "title": "Architecture",
      "cards": [
        {
          "id": "arch-1",
          "title": "Transport stacks two unknowns",
          "body_md": "**ELI10:** serve + await are both deferred.\n**Recommendation:** spike the walking skeleton first.",
          "status": "open",
          "default_decision": "accept"
        }
      ]
    },
    {
      "id": "tests",
      "title": "Tests",
      "cards": [
        {
          "id": "tests-1",
          "title": "No idle-timeout test",
          "body_md": "Add a short-idle override so the reaper is covered.",
          "status": "new"
        }
      ]
    }
  ],
  "global_notes_prompt": "Overall direction, or anything to restructure?"
}
```

### Payload (what comes back)

| field | type | notes |
|---|---|---|
| `session_id` / `revision_id` / `source_hash` | string | echoed; the server checks them |
| `action` | `submit` \| `finish` | `finish` ends the loop |
| `decisions` | object | `{ <card_id>: { decision, edited_text?, notes? } }` |
| `decision` | `accept` \| `reject` \| `edit` | per card |
| `edited_text` | string | present when the user rewrote the finding |
| `notes` | string | free-form, per card — interpret conversationally |
| `global_notes` | string | optional overall note |

<!-- example:payload -->
```json
{
  "session_id": "sess-1a2b3c4d5e6f",
  "revision_id": "rev-1",
  "source_hash": "9f2c1a",
  "action": "submit",
  "decisions": {
    "arch-1": { "decision": "accept" },
    "tests-1": { "decision": "edit", "edited_text": "Cover the idle reaper with a 1.2s test override.", "notes": "keep it fast" }
  },
  "global_notes": "Looks right — proceed."
}
```

### Finding identity (the merge contract)

- **You own the ids.** Keep a card's id **stable across re-renders** for as long
  as it's the same finding. A finding you reworded keeps its id; a brand-new one
  gets a fresh id (`status:"new"`); a finding you dropped is rendered
  `status:"resolved"`, not deleted.
- The renderer **rejects** a payload whose decisions reference an id not in the
  current spec (`unknown_card_ids`) — a stale or reordered decision is never
  silently applied to the wrong card. If you see this, re-render the current
  revision and tell the user the view moved.

### Reject statuses the server may return

- `stale_revision` — submit was for an older revision; re-render, re-await.
- `unknown_session` — wrong/expired session; `serve` again.
- `unknown_card_ids` — see *Finding identity*.
- unreachable / `await` timeout — fall back (below).

### Block-with-fallback — HTML is the path; falling back needs a real failure

The loop blocks on `await`, but you are never hard-stuck. The fallbacks below are
**failure handling, not a menu** — never drop the HTML render because the user
"would rather not open a browser" or because serial questions feel simpler:

- `await` **times out** (exit 5) → the view is still waiting; re-await. A timeout
  is **not** an unreachable server — do NOT fall back to AskUserQuestion here.
- **Transport unreachable but the page rendered** (`serve` succeeded, then
  `await`/`render` exit 6 / server unreachable) → stay in HTML: the rendered page
  always shows a **"Copy response"** block, so the user pastes the payload JSON
  back to you. Parse it identically.
- **`serve` itself fails to start** (no page ever renders) → this is the **only**
  condition that permits the **one-AskUserQuestion-per-finding** fallback.

Absent a genuine `serve`-fails-to-start or exit-6 unreachable failure, HTML is the
only path — do not substitute AskUserQuestion because it is simpler.
