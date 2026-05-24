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

## UI error display (forms & dialogs)

One visual language for **all** user-facing errors in forms and dialogs. Do **not**
use a filled `<Alert>` (colored background) for form/validation errors — that style
is reserved for persistent informational banners (e.g. the email-verification
banner), not transient errors.

- **Style:** plain red text, medium weight — `<Text size="sm" c="red" fw={500}>`,
  or Mantine's built-in field error via `form.setFieldError` (weight set globally
  in `index.css`). No background fill, no border, no icon. Emphasis comes from
  color + weight, **not** font size (don't make error text larger than body).
- **Field stays neutral:** no red border / placeholder / icon on the input itself —
  only the message below it is red (enforced globally in `frontend/src/index.css`).
- **Placement:**
  - *Field-scoped* (tied to one input) → directly under that field. Use
    `form.setFieldError(field, msg)`; for non-form controls (e.g. `PinInput`) render
    the red `<Text>` right under the control.
  - *Operation-scoped* (the whole action failed, not one field) → at form level,
    next to the primary action (under the submit button / by the dialog actions).
- **Text source:** always resolve via `messageForCode(code)` from `api/errors.ts`
  (English, owned by the frontend) — never render the backend `message` (it's in
  Russian and won't match the UI language).

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
