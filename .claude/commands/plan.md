---
description: Restate requirements, assess risks, and create step-by-step implementation plan. WAIT for user CONFIRM before touching any code.
---

# Plan

Create an implementation plan **before** writing code. Run inline (do not invoke the `Plan` subagent or `Task` without an explicit request).

## When to use

- New feature / architectural changes / complex refactoring
- Multiple files or layers are affected (DDD: domain ↔ infra ↔ application ↔ presentation)
- Requirements are ambiguous

## What to do

1. **Restate requirements** — rephrase the request explicitly
2. **Identify risks** — what can break (migrations, contracts, backwards compatibility)
3. **Plan by phases** — concrete files and steps, minimum abstractions
4. **Wait for confirmation** — **do NOT start implementation** until an explicit "yes/proceed"

## Plan format

```
## Requirements
- ...

## Phases
### Phase 1: <name>
- File: app/<domain>/<layer>/<file>.py — <what we do and why>
- ...

## Risks
- HIGH: <risk> — mitigation: <how>
- MEDIUM: ...

## Estimated complexity: HIGH/MEDIUM/LOW
```

## Confirmation prompt

After printing the plan, ask via `AskUserQuestion` (do **not** ask in chat — the user wants a keyboard-navigable picker, not a typed reply):

- **question**: `"Confirm the plan and start Phase 1?"`
- **header**: `"Plan"`
- Options (in this order):
  1. `Proceed` (Recommended) — "Start Phase 1 with the plan as-is"
  2. `Modify` — "Discuss changes before starting"
  3. `Cancel` — "Drop the plan, don't write `.current-plan.md`"

If the plan has any explicit per-phase open questions (e.g. "Phase N — execute or skip?", "Phase M — approach A or B?"), include them as additional questions in the **same** `AskUserQuestion` call. Limit: 4 questions total per call, so prioritize the most decision-blocking ones.

## After confirmation

- Implementation: tests are written alongside the code or after
- Build/type errors → `build-error-resolver` agent
- Done → `python-review` (backend) / `typescript-reviewer` agent (frontend)

## State file (`.claude/.current-plan.md`)

**This file is gitignored and survives context compaction.** It is the source of truth for "where are we in the plan" between turns.

Lifecycle:

1. **Right after the user confirms the plan** (`yes / proceed`) — write the agreed plan to `.claude/.current-plan.md` using the format below. Do this *before* starting Phase 1.
2. **After each phase is confirmed done** (user said `yes / move on`) — update the file: flip the phase checkbox to `[x]` and append a one-line note about what shipped.
3. **After the user confirms the whole task is complete** — delete the file.

If `.claude/.current-plan.md` already exists when `/plan` is invoked, ask the user whether to resume it or overwrite — never silently overwrite.

### Format

```markdown
# Current plan: <one-line task title>

Started: <YYYY-MM-DD>
Branch: <git branch name>

## Requirements
- ...

## Phases
- [ ] Phase 1: <name>
  - File: app/<domain>/<layer>/<file>.py — <what & why>
- [ ] Phase 2: <name>
  - ...

## Risks
- HIGH: ... — mitigation: ...

## Progress log
- (filled in as phases complete)
```

## Phase checkpoints

After finishing each phase, stop before starting the next one. Report briefly:
- what's done in this phase (1–2 lines)
- what's next

Then ask via `AskUserQuestion` (do **not** ask in chat — keyboard-navigable picker):

- **question**: `"Phase N complete. Move on to Phase N+1?"` (substitute actual numbers)
- **header**: `"Phase N→N+1"` (substitute actual numbers, max 12 chars)
- Options (in this order):
  1. `Move on` (Recommended) — "Start Phase N+1"
  2. `Discuss this phase` — "Chat about what shipped before moving on"
  3. `Stop here` — "Pause the plan; keep `.current-plan.md` for later resumption"

Wait for an explicit answer. Do not proceed on silence or implicit signals. Once the user picks `Move on` — update `.claude/.current-plan.md` (check the phase off, log a line) before starting the next phase.

## Task completion: CHANGELOG + version bump

When the user confirms the whole task is done (all phases checked off, explicit "done / closed / ship it"), but **before** deleting `.claude/.current-plan.md`:

1. Read the current version from `pyproject.toml` (field `version = "X.Y.Z"`).
2. Decide the SemVer bump type yourself, based on `.current-plan.md` (Phases + Progress log):
   - **major** (X+1.0.0) — incompatible changes to public API/contracts: removed/renamed endpoints, non-backwards-compatible SQL migrations, changes to token/auth formats.
   - **minor** (X.Y+1.0) — new functionality, backwards-compatible: new endpoints, new components, expanded capabilities.
   - **patch** (X.Y.Z+1) — bug fixes, refactoring with no visible API changes, documentation fixes, code cleanup.
3. Ask via `AskUserQuestion`:
   - **question**: `"Task closed. Update CHANGELOG.md and bump version <current> → <proposed>?"`
   - **header**: `"Release"`
   - Options: first — the recommended bump (label suffix `(Recommended)`), then alternative bumps, then `Skip` (don't update). Each option's description is one line explaining why this bump fits / doesn't fit.
4. If the user picks a bump:
   - Update `pyproject.toml` (only the `version` field).
   - Prepend a new release section to `CHANGELOG.md`, **strictly matching the style of existing entries** (language of the existing CHANGELOG, heading `## [X.Y.Z] YYYY-MM-DD`, sections like "Added / Changed / Fixed / Removed" — use the existing localised section names).
   - **Source content from `.current-plan.md` but do not copy verbatim** — distill 2–5 user/developer-facing bullets ("what" and "why"), not process detail ("moved file X", "updated imports"). For pure refactors with no observable API change, a single line in "Changed" beats enumerating phases.
5. If the user picks Skip — proceed without touching CHANGELOG/pyproject.
6. Delete `.claude/.current-plan.md`.

Do NOT propose a CHANGELOG/version bump for cancelled or rolled-back tasks, or when the final build/tests are red.
