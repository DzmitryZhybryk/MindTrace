---
description: Comprehensive Python code review for PEP 8 compliance, type hints, security, and Pythonic idioms. Invokes the python-reviewer agent.
---

# Python Review

Thin wrapper for the **python-reviewer** agent. All review categories, severity levels, diagnostic commands, and project specifics (DDD, DTO conventions, BaseUnitOfWork, structlog) live in `agents/python-reviewer.md`.

## What to do

1. Launch `python-reviewer` via the `Agent` tool with `subagent_type: python-reviewer`
2. Pass in the prompt: review scope (`git diff -- '*.py'` by default; otherwise clarify with the user — staged/branch/PR)
3. When the report comes back, forward it to the user **as is**, without rephrasing

## When to use

- After modifying `.py` files in `app/`, `tests/`, `migrations/`
- Before commit / PR
- When onboarding new code

## Approval criteria

| Status | Condition |
|---|---|
| Approve | No CRITICAL or HIGH |
| Warning | Only MEDIUM (merge with caution) |
| Block | CRITICAL or HIGH found |

## Related

- TS/JS — `typescript-reviewer` agent
- Build/type errors → `build-error-resolver` agent
