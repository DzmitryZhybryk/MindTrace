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
- File: backend/app/<domain>/<layer>/<file>.py — <what we do and why>
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
  - File: backend/app/<domain>/<layer>/<file>.py — <what & why>
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

Frontend and backend are versioned **separately**. The single source of truth for the rules is `CLAUDE.md` → Git → **"Versioning & changelog"** — read it rather than relying on the summary here.

When the user confirms the whole task is done (all phases checked off, explicit "done / closed / ship it"), but **before** deleting `.claude/.current-plan.md`:

1. **Determine the area** of the change from `.current-plan.md` — backend, frontend, or both:
   - backend → version in `backend/pyproject.toml` (+ `backend/uv.lock` if dependencies changed)
   - frontend → version in `frontend/package.json`
2. Read the current version of the affected artifact(s) and decide the SemVer bump from the Phases + Progress log:
   - **major** — incompatible public-contract changes (removed/renamed endpoints, breaking SQL migrations, token/auth-format or error-`code` changes).
   - **minor** — new backwards-compatible functionality.
   - **patch** — fixes, refactors, doc/cleanup with no visible contract change.
3. Ask via `AskUserQuestion`:
   - **question**: `"Task closed. Bump <artifact> <current> → <proposed> and update CHANGELOG?"`
   - **header**: `"Release"`
   - Options: recommended bump first (label suffix `(Recommended)`), then alternatives, then `Skip`. One-line description per option.
4. If the user picks a bump:
   - Update only the **affected** artifact's version (`backend/pyproject.toml` + `backend/uv.lock`, and/or `frontend/package.json`) — never bump the untouched artifact.
   - Prepend to `CHANGELOG.md` (one file at repo root) **in the existing style**: a dated heading with `### Backend X.Y.Z` / `### Frontend X.Y.Z` subsection(s) and the existing localised section names (Добавлено / Изменено / Исправлено / Удалено).
   - **Source content from `.current-plan.md` but do not copy verbatim** — distill 2–5 user/developer-facing bullets ("what" + "why"), not process detail ("moved file X"). For pure refactors, a single line in "Изменено" beats enumerating phases.
5. **Docs:** if the task introduced a new domain / shared vertical / changed a layer boundary or naming convention, reflect it in `CLAUDE.md` (and the `docs/architecture.md` principles if affected). Mechanical file-tree changes need **no** doc update — the structure is derived from code, not hand-maintained.
6. If the user picks Skip — proceed without touching versions/CHANGELOG.
7. Delete `.claude/.current-plan.md`.

Do NOT propose a CHANGELOG/version bump for cancelled or rolled-back tasks, or when the final build/tests are red.
