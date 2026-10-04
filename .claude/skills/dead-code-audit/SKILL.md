---
name: dead-code-audit
description: Use when asked to find or remove dead code, unused functions, exports, files or dependencies in backend/ or frontend/.
---

# Dead-code audit

```bash
cd backend && uv run vulture app/ vulture_whitelist.py   # unused functions/classes (min_confidence=60)
cd backend && uv run ruff check . --select F401,ERA      # unused imports + commented-out code
cd frontend && npx knip                                  # unused files, exports, dependencies
cd frontend && npx ts-prune                              # unused TS exports
cd frontend && npx depcheck                              # unused npm dependencies
```

- A false positive from vulture (dynamic imports, FastAPI routes) goes into
  `backend/vulture_whitelist.py`; never lower `min_confidence` to hide it.
- Remove in batches: dependencies first, then exports, then files. After each batch run the tests
  and commit (the `git-workflow` skill covers the commit).
