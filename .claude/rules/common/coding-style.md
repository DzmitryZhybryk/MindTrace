# Coding Style

## Core Principles

- **KISS** — the simplest solution that works. Optimize for clarity, not cleverness.
- **DRY** — extract repeated logic; don't introduce abstractions in advance.
- **YAGNI** — don't build features and abstractions until there's an actual need.

## Immutability (CRITICAL)

ALWAYS create new objects, NEVER mutate existing ones. Immutability removes hidden side effects and simplifies debugging.

Language specifics:
- Python — `@dataclass(frozen=True, slots=True)` for transport objects (see CLAUDE.md → DTO conventions).
- TypeScript — `Readonly<T>` + spread (`{...obj, field: value}`).

## File Organization

- High cohesion, low coupling
- Typical file size 200–400 lines, **800 is the ceiling**
- Organize by feature/domain, not by file type

## Error Handling

- Handle errors explicitly at every layer
- Don't silently swallow exceptions
- At system boundaries (HTTP, external APIs, files) — fail fast with a clear message
- In UI — user-friendly text; in logs — detailed context

## Input Validation

Validate at system boundaries (HTTP body, external API responses, file content). Never trust external data.

## Naming Conventions (general)

- Booleans: prefixes `is`, `has`, `should`, `can`
- Constants: `UPPER_SNAKE_CASE`
- Descriptive names; 1–2 letter names only in short lambdas/loops

> Casing follows the language: Python — `snake_case`/`PascalCase` (PEP 8), TypeScript — `camelCase`/`PascalCase`/`use*` for hooks (see `typescript/coding-style.md`).

## Code Smells

- **Deep nesting** (>4 levels) → early returns
- **Magic numbers** → named constants
- **Long functions** (>50 lines) → split by responsibility

## Quality Checklist

Before wrapping up:
- [ ] Names are readable and descriptive
- [ ] Functions are short (<50 lines)
- [ ] Files are focused (<800 lines)
- [ ] No deep nesting (>4)
- [ ] Errors handled explicitly
- [ ] No hardcoded values (use constants/config)
- [ ] Immutable patterns
