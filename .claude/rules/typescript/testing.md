# TypeScript / React Testing

> Extends [common/coding-style.md](../common/coding-style.md) and
> [typescript/coding-style.md](./coding-style.md) for the frontend test suite (`frontend/`).
> This file is the **source of truth** for *how we test the frontend*. It mirrors the backend's
> [python/testing.md](../python/testing.md): unit-first, classicist, mock only the I/O boundary.
> All commands run from `frontend/`.

## Testing pyramid (what lives where)

Two orthogonal axes: **test type** (speed + dependencies) and **module/feature** (mirror of `src/`).

| Type | Touches I/O / DOM? | What it covers | Run profile |
|---|---|---|---|
| **unit** | No (pure logic) | `api/` helpers, `auth/` token/jwt/events logic, zod schemas, pure utils | every commit, fast |
| **component** | Simulated DOM (jsdom) | a React component: render → interact → assert what the user sees | pre-merge / CI |
| **e2e** | Real browser + stack | full flows in Chromium/Firefox/WebKit against `docker compose` | nightly / pre-release |

The **bulk of value is in `unit`** (the `api`/`auth` logic modules). Keep component thin (forms,
dialogs, the banner) and e2e thinnest (the critical happy paths from `.claude/.test-plan.md`).

## Tooling

- **Vitest** — runner. Reuses `vite.config.ts` (one config source); `test` block configures
  `environment: "jsdom"`, `setupFiles: ["./src/test/setup.ts"]`, v8 coverage. Test APIs are
  **imported explicitly** from `vitest` (no global injection — Vitest's default), so app code never
  sees `describe`/`it`/`vi`.
- **jsdom** — simulated DOM. `sessionStorage`, `localStorage`, `atob`, `btoa` exist; **`fetch` is
  stubbed per-test** (`vi.stubGlobal`), **`matchMedia` does not exist** — mock it in component setup.
- **@testing-library/react** + **@testing-library/user-event** + **@testing-library/jest-dom** —
  component layer (added in the component phase).
- **MSW** — network mocking for the component layer (the reusable "API fakes", analogous to the
  backend `tests/fakes/`). For **unit** tests, stub `fetch` directly with `vi.stubGlobal`.
- **Playwright** — e2e (added later).

Scripts: `npm run test` (watch), `npm run test:run` (CI one-shot), `npm run coverage`. The suite is
split by **`VITEST_SCOPE`** (read in `vite.config.ts` → `resolveVitestInclude`): `npm run test:unit`
(`VITEST_SCOPE=unit` → `src/**/*.test.ts`, pure logic) and `npm run test:component`
(`VITEST_SCOPE=component` → `src/**/*.test.tsx`, React render); unset runs both. `make test` /
`test-unit` / `test-component` mirror these. e2e (`*.spec.ts`) is Playwright and never matched here.

## Directory layout

**Co-located `*.test.ts(x)` next to the module under test** — `jwt.ts` → `jwt.test.ts` in the same
folder. This is idiomatic for Vite/Vitest and follows "organize by feature, not by file type"
(common/coding-style.md). It deliberately differs from the backend's mirrored `tests/` tree — a
frontend module and its test ship together.

```
frontend/src/
├── test/                       # shared test infrastructure (NOT a mirror tree)
│   ├── setup.ts                # global setup: i18n bootstrap (+ jest-dom, matchMedia, MSW later)
│   ├── render.tsx              # (component phase) custom render with providers
│   └── handlers.ts             # (component phase) reusable MSW handlers = the "API fakes"
├── api/
│   ├── client.ts   + client.test.ts
│   └── errors.ts   + errors.test.ts
└── auth/
    ├── jwt.ts      + jwt.test.ts
    └── tokenStore.ts + tokenStore.test.ts
e2e/                            # (e2e phase) Playwright specs by .claude/.test-plan.md flow
```

## Philosophy: classicist + mock only the network

- **State-based (classicist), not interaction-based (mockist).** Assert on what the user sees / the
  returned value / the resulting state — never on call order or component internals (props, hooks,
  state). Same rule as the backend's "state-based, not interaction-based".
- **Mock only the I/O boundary — the network.** In unit tests that's `fetch` via `vi.stubGlobal`;
  in component tests that's **MSW** (intercept at the network layer, never mock `apiFetch`/modules).
  Everything below the network (token store, jwt decode, error mapping, zod) runs **real**.
- **Query like a user (component layer).** `getByRole` / `getByLabelText` / `findByText`, **not**
  `data-testid` or CSS classes. Testing Library's guiding rule: the more a test resembles real
  usage, the more confidence it gives.
- **`AsyncMock`-style spies only for side-effect collaborators** whose *call* is the behavior under
  test (e.g. `form.setFieldError`, an emitted event listener) — use `vi.fn()` and assert it was
  called. Prefer observing the resulting state over spying wherever possible.

## Determinism

- **Time:** prefer constructing inputs with explicit values (e.g. a JWT `exp` baked into the test
  token) over faking the clock. Reach for `vi.useFakeTimers()` only for code that reads "now"
  (cooldowns, debounce). Do **not** fake timers globally.
- **Randomness / opaque values** (tokens, ids): never predict the value — assert the **invariant**
  (e.g. the `Authorization` header equals `Bearer ${theTokenWeStored}`).
- **Module-level state is the main hazard.** `client.ts` (`pendingRefresh`), `tokenStore`, `events`
  hold state on the module. Reset it in `beforeEach` — `clearAccessToken()`, `sessionStorage.clear()`,
  `vi.unstubAllGlobals()`, and `vi.resetModules()` when a fresh module instance is needed. A test
  must not depend on another test's leftover state.
- **Controlling async** (e.g. single-flight refresh): use a deferred promise (a `fetch` stub you
  resolve by hand) so two concurrent callers are provably in-flight together, then assert
  `fetch` was called once.

## Reuse before create (check first)

Before adding a helper / fixture / MSW handler / render wrapper, **scan what already exists and reuse
it**. The shared seams live in `src/test/` (`render.tsx`, `handlers.ts`, `setup.ts`) — extend them,
don't fork a near-duplicate next to a single test. A duplicated handler/render wrapper is the same
defect as copy-pasted production code. One cheap scan:

```bash
rg -n "export (function|const)" src/test
rg -n "vi\.stubGlobal|http\.(get|post)" src
```

- **No file-local data helpers** when a shared one fits. Build small inputs inline in the test (keeps
  it self-contained); promote to `src/test/` only once the *same* construction repeats across files.
- **MSW handlers are the frontend's `tests/fakes/`** — full, reusable request handlers in
  `src/test/handlers.ts`, overridden per-test with `server.use(...)` for the error cases.

## Conventions

- **Import test APIs explicitly** from `vitest` — `import { describe, it, expect, vi } from "vitest"`
  (only what the file uses). No `globals: true`; this keeps app code free of test globals.
- **`describe` per unit/component, flat `it` inside** — no nesting beyond `describe` → `it`. Group
  related cases by `it` naming and subset with `-t`.
- **Test descriptions are one-line Russian** (matches the backend's Russian test docstrings and the
  project's Cyrillic-in-comments rule): `it("возвращает null для токена не из трёх частей", ...)`.
- **`async`/`await`** for async assertions; `await expect(...).rejects.toThrow(...)` for throwing
  paths. Use `findBy*` (async) over `getBy*` when the DOM updates after an await.
- **Named arguments / explicit options everywhere** (project rule) — including `getByRole("button",
  { name: "Sign in" })`.
- **No `any`** in tests either — `unknown` + narrowing, or precise types. oxlint applies to
  `*.test.ts(x)` the same as production code.
- **Reset in `beforeEach`**, clean up in `afterEach` (`vi.unstubAllGlobals()`, `vi.restoreAllMocks()`).

## Coverage

Wire `@vitest/coverage-v8` from day one, but **do not** set a coverage threshold until a baseline
exists (red CI on an empty suite is noise). Targets once populated: the `api`/`auth` logic modules
~90%; do not chase 100% on components/pages in the unit phase. `npm run coverage` reports text + html.
Note: the v8 **text** reporter silently hides files already at 100% — for exact per-file numbers run
`--coverage.reporter=json-summary` and read `coverage/coverage-summary.json`.

## Anti-patterns (do not)

- Assert on component internals (state/props/hooks) or call order → assert what the user sees / the
  result (classicist).
- Mock `apiFetch` or other internal modules → mock the **network** (`fetch` stub / MSW) and let the
  real code run.
- Query by `data-testid` / CSS class when a role/label/text query works.
- Leak module state between tests (forgot to reset `tokenStore` / `pendingRefresh` / globals).
- Fake timers or the clock globally → fake locally only for code that reads "now".
- Recreate an existing `render`/handler/helper → scan `src/test/` first and reuse.

## CI (not wired yet)

There is no CI workflow yet. The scripts are CI-ready: a future workflow runs `npm run lint`,
`npm run test:run`, and `npm run build` from `frontend/`. Until then these run locally before merge,
alongside the manual UI checks in [web/performance.md](../web/performance.md).
