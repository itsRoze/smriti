# Project: smriti

## Overview
smriti is a personal Claude Code skill stack built around one command, `/begin`, that takes a change from idea to a reviewed, tested, shipped result in a single straight line — exploring the codebase with parallel agents, drafting a plan, getting a Codex second opinion, serving it as an interactive HTML plan you approve, then implementing, running `/code-review`, verifying with Playwright screenshots, and shipping. It bootstraps a repo on first run and investigates root cause when the request is a bug. It stops for the human at exactly three gates (a genuine question, plan approval, final review) and drives everything between them. It also shares a short set of coding principles across every repo that imports them. This is the meta-tool: the thing that builds all the other things. Strategically important as a vehicle for staying current with AI-assisted coding patterns, with a long-term eye toward open-sourcing.

## Users
Just the author (solo developer). smriti is built for one person's workflow and taste. If it ever opens up, the audience is Claude Code power users who want structured skill pipelines — but that's not today's target.

## Lean
**Prototype.** Ship fast, iterate on real usage. smriti itself enforces rigor on downstream projects; smriti's own development prioritizes velocity and learning over exhaustive failure-mode coverage.

## Tech Stack
- Bash (all `bin/` CLI helpers — the runtime backbone)
- Bun / TypeScript (build scripts, codegen, skill template generation)
- Markdown (skill templates, resolvers, principles)
- Playwright (screenshots + ARIA/console audit in `/begin`'s verify step, via `smriti browse`)
- jq (JSON manipulation in shell pipelines)
- git + gh (version control, PR creation from /begin's ship step)

## Deploy
Local CLI tool. No deploy target — installed by cloning the repo and adding `bin/` to PATH (now via umbrella dispatcher).

## Design Priority
**Low.** CLI and skill stack — no user-facing UI beyond terminal output, the interactive HTML plan view, and Playwright-rendered verify pages.

## Decisions Log
- 2026-05-20 Bootstrapped via /bootstrap. Lean set to prototype.
- 2026-08-09 Opinion layer retired (ticket #7): /ship, /clean, /debug and /bootstrap folded into /begin as internal steps, leaving two skills (the flow and the taste). principles.md cut 179 → 50 lines: the four AI-facing behaviors kept, the tier ladder and style tutoring deleted. New `ship_target` config key (pr | main).
- 2026-07-09 v1.0 teardown: collapsed the multi-stage pipeline into a single `/begin` flow with three human gates. Deleted /brainstorm, /plan, /plan-eng-review, /plan-design-review, /eng-review, /design-review, /work, /learn and the approvals + learnings machinery. Native `/code-review` and the `frontend-design` skill replace the review skills; Codex reviews the plan.
