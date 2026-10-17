---
paths:
  - "backend/**/*.py"
---

# Python security

Extends `common/security.md`.

- Secrets and config come only from `settings` (`app/shared/settings.py`: pydantic-settings,
  frozen, cached). No `os.environ[...]` / `load_dotenv()` in app code — it bypasses validation and
  `frozen=True`.
- A sensitive field is `SecretStr` (as `RESEND_API_KEY`), so it cannot leak through `repr()` /
  structlog; unwrap with `.get_secret_value()` only where the value is used.
- Security lint is ruff `S` (flake8-bandit) inside `make lint`; dependency CVEs — `make audit`. No
  separate bandit run.
