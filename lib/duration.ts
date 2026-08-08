// How smriti says "how long". One grammar, so two surfaces can never disagree
// about the same run.
//
// There is a third copy of this, in awk, inside bin/smriti-trace (`fmt_dur_awk`)
// and a fourth in the board's client script — those live in runtimes that
// cannot import a module (a bash CLI, and a page authored as one string). The
// two that CAN share are shared here; if the thresholds ever change, that awk
// function and lib/board-ui.ts's `fmtDur` have to move with them.

/** Seconds → `12s` / `4m 30s` / `42m` / `1h 12m`. Negatives clamp to zero. */
export function fmtDur(secs: number): string {
  const s = Math.max(0, Math.round(secs || 0));
  if (s < 60) return `${s}s`;
  if (s < 600) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${m}m ${r}s` : `${m}m`;
  }
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Seconds elapsed since an ISO-8601 instant, or 0 if it does not parse. */
export function sinceSecs(iso: string | null | undefined): number {
  const ms = Date.parse(iso ?? '');
  return ms ? Math.max(0, Math.round((Date.now() - ms) / 1000)) : 0;
}
