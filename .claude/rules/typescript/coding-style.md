---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# TypeScript Coding Style

> Extends [common/coding-style.md](../common/coding-style.md) for the frontend (`frontend/src/`).

## Types

- **Public APIs** (exported functions, component props, shared utils) — explicit parameter and return types.
- **Local variables** — let TS infer.
- **`interface`** — for object shapes that may be extended/implemented.
- **`type`** — for union/intersection/tuple/mapped/utility types.
- **String literal unions** are preferred over `enum` (unless interop demands it).

## Avoid `any`

- `any` is forbidden in application code.
- For external/untrusted input — `unknown` + safe narrowing.
- For dependence on the caller's type — generics.

## React Props

- Props via a named `interface` or `type`.
- Type callback props explicitly.
- **Do not use `React.FC`** without a specific reason.

## Immutability

Spread for immutable updates; no direct mutation of props/state:

```typescript
return { ...user, name }   // ok
user.name = name           // no
```

## Error Handling

`async/await` + `try/catch`, `unknown` error with safe narrowing via `instanceof Error`.

## Input Validation

Schema validation via **Zod** at boundaries (HTTP, forms); the type is inferred from the schema — `z.infer<typeof schema>`.

## No `console.log`

`console.log` is forbidden in production code.

## Naming

- Variables/functions — `camelCase`
- Types/interfaces/components — `PascalCase`
- Constants — `UPPER_SNAKE_CASE`
- Custom hooks — `useXxx` (`useDebounce`, `useReducedMotion`)
- Booleans — `is`/`has`/`should`/`can`
