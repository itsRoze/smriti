# Project: smriti

## Overview
smriti is a personal Claude Code skill stack — an opinionated pipeline of skills (`/brainstorm`, `/plan-eng-review`, `/eng-review`, `/ship`, etc.) that chains design → review → ship into a repeatable workflow. It learns across sessions via per-project learnings, and enforces coding principles across every repo that imports them. This is the meta-tool: the thing that builds all the other things. Strategically important as a vehicle for staying current with AI-assisted coding patterns, with a long-term eye toward open-sourcing.

## Users
Just the author (solo developer). smriti is built for one person's workflow and taste. If it ever opens up, the audience is Claude Code power users who want structured skill pipelines — but that's not today's target.

## Lean
**Prototype.** Ship fast, iterate on real usage. The pipeline itself enforces rigor on downstream projects; smriti's own development prioritizes velocity and learning over exhaustive failure-mode coverage.

## Tech Stack
- Bash (all `bin/` CLI helpers — the runtime backbone)
- Bun / TypeScript (build scripts, codegen, skill template generation)
- Markdown (skill templates, resolvers, principles)
- Playwright (browser audit for `/design-review`)
- jq (JSON manipulation in shell pipelines)
- git + gh (version control, PR creation via `/ship`)

## Deploy
Local CLI tool. No deploy target — installed by cloning the repo and adding `bin/` to PATH (now via umbrella dispatcher post-ELI-45).

## Design Priority
**Low.** CLI and skill stack — no user-facing UI beyond terminal output and occasional Playwright-rendered audit pages.

## Decisions Log
- 2026-05-20 Bootstrapped via /bootstrap. Lean set to prototype.
