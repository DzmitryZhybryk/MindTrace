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
