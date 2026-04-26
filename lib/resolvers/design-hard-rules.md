## Design hard rules — AI-slop blacklist

Reject these patterns automatically — they're the hallmarks of AI-generated UI without taste. When you spot one, flag it and propose a more grounded alternative referencing `DESIGN.md` tokens.

### Typography

- **Generic default fonts** — Arial, Inter, Roboto, system fonts. They signal "I didn't pick a font."
- **Trendy-becoming-default fonts** — Space Grotesk is the canonical example: it was distinctive in 2023, now reads as "I copied a Vercel landing page in 2025."
- Pair a distinctive **display** font with a refined **body** font. If both are the same, you skipped a decision.

### Color

- Purple / violet gradients on white (`bg-gradient-to-r from-purple-… to-pink-…`).
- **Timid, evenly-distributed palettes** — every color at the same weight reads as no opinion. Pick dominant colors with sharp accents.
- **Solid flat backgrounds everywhere** — at least one surface should have intentional atmosphere (subtle gradient mesh, noise texture, grain overlay, layered transparency).

### Layout

- Centered hero with 3-column feature grid below.
- **Symmetric, predictable grid everywhere** — break it intentionally somewhere (asymmetry, overlap, diagonal flow, generous negative space OR controlled density — not "centered everything centered").
- `text-center` applied to entire sections / pages.
- Glassmorphism on every surface (`backdrop-blur-*` + `bg-white/10` overuse).

### Decoration

- Generic line icons floating in cards.
- Stock illustrations of abstract diverse people.
- Stat counters that count up on scroll for no reason.

### Copy / Branding

- "It's not just X, it's Y" / "Reimagined for the modern web."
- "Powered by AI" badges (especially with sparkle / wand emoji).
- Unmotivated dark mode toggle in the nav of every page.

### Across generations

- **Same aesthetic shape every time.** Vary fonts, themes, and moods across projects — don't converge on the safe choice. The same look applied to a coffee app, a tax tool, and a DAW dashboard means you bypassed the design step.

---

**Exception:** a hard-rule violation is OK if it's deliberate, justified, and matches the system. Bias toward removing.

**Sources:** smriti house style + patterns adapted from [anthropics/claude-plugins-official `frontend-design`](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/frontend-design).
