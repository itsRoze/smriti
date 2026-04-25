## Completeness rubric (0–10)

When presenting options that differ in **coverage** (e.g., "test happy path only" vs "test all error paths"), include a `Completeness: N/10` score per option:

- **10** — every edge case + failure mode covered
- **8** — common edge cases covered, rare ones acknowledged
- **6** — happy path + obvious errors handled
- **4** — happy path only
- **2** — best-effort partial happy path
- **0** — not implemented

For options that differ in **kind** (architecture A vs B vs C), do NOT score — note "options differ in kind."

Recommend the highest-completeness option unless the user's `lean=prototype` (from `smriti-config get lean`) or stated time pressure justifies a lower score. Always state the recommendation explicitly: *"Recommendation: option N because…"*
