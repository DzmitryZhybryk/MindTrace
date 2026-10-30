# Backend process: cross-cutting choices

## Settings are one import-time singleton
- `app.shared.settings` builds `settings` (`get_app_settings()`) when first imported; entrypoints, components and
  presentation dependencies read it directly. Domain tunables still reach `application` only as a `*Config` built in
  `presentation/dependencies.py` (`layers.md`, "Domain config").
- Why: one process, one source of configuration. Tests never vary the global — unit tests build `*Settings` sub-models
  and `*Config` through constructors, api tests override the presentation dependency.
- Rejected: `Settings` built in the entrypoint and threaded through `create_app(settings=...)`, the component registry
  and a `settings_dependency` (the ai-recap pattern) — it solves per-test settings variation, which this project already
  gets from constructors, and costs a `Settings()` at every entrypoint, a `Depends(settings_dependency)` in every
  dependency that needs one field, and a second settings object whenever a factory reads the environment itself.
- Revisit when: a test must vary a setting that no `*Settings`/`*Config` constructor reaches, or two apps with different
  settings share one process.
- Source: plan D review, 2026-10-24

## The backend version is static in `[project].version`
- The version is bumped by hand in the feature's commit (skill `git-workflow`); the app reads it from the installed
  package's metadata (`importlib.metadata.version`).
- Why: one source, visible in the diff of the change that earns it.
- Rejected: `hatch-vcs` (version from the git tag) — the `backend-vX.Y.Z` tag goes on `main` after the merge, so a
  feature branch would carry `X.Y.Z.devN+g…` and the bump rule would disappear.
- Source: PR #175, 2026-10-28

## Schema names in `openapi.json` are not part of the versioned contract
- Renaming a component (`LanguageEnum`, `TransportTypeEnum`, `MovePlacementEnum`) with the wire values unchanged is
  a patch bump; the regenerated `frontend/src/api/generated/` lands in the same commit (`codegen-contract.md`).
- Why: the backend version tracks what an HTTP client observes — routes, payload shapes, wire values, error `code`s.
  A component name is a label inside the schema document; the only consumer that depends on it is the frontend SDK,
  which is regenerated in the same commit.
- Rejected: major bump — treats every generator-visible rename as breaking while no client outside this repo generates
  code from `openapi.json`.
- Revisit when: a client outside this repo generates code from `openapi.json`.
- Source: PR #172, 2026-10-28

## `info.version` in the `openapi.json` snapshot is a constant, not the package version
- The snapshot test (`test_openapi_schema.py`, `_SNAPSHOT_VERSION`) replaces `info.version` before comparing and
  before writing the file through `make openapi-dump`. The running app still reports the package version in its
  live schema and `/docs`.
- Why: the committed file is the codegen input of the frontend SDK, and the generator ignores `info.version`; with
  the real version every backend bump rewrote `openapi.json` without a contract change.
- Rejected: the real version in the snapshot (until 2026-10-30) — every bump turned the snapshot gate red and added
  an `openapi.json` diff to a commit that did not touch the API.
- Rejected: no `version` passed to `FastAPI` — OpenAPI requires `info.version`, so FastAPI fills in `0.1.0`, a
  misleading number in `/docs`.
- Revisit when: a client outside this repo generates code from or reads `openapi.json`.
- Source: PR #176, 2026-10-30
