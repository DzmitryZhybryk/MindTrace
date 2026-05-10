---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Security

> This file extends [common/security.md](../common/security.md) with Python specific content.

## Secret Management

In this project secrets are loaded via **pydantic-settings** (`app/shared/settings.py`), not via manual `os.environ` or `dotenv.load_dotenv()`. Settings is a frozen model, read once and cached as a singleton.

```python
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", frozen=True)

    db_password: SecretStr
    jwt_secret: SecretStr
```

- Sensitive values use `SecretStr` so they don't leak into logs via `repr()` / structlog.
- Access the value via `settings.jwt_secret.get_secret_value()`.
- Do not use `os.environ[...]` directly in business code: it bypasses validation and `frozen=True`.
- `.env` is already in `.gitignore` — make sure new secrets don't end up in a commit.

## Security Scanning

- Bandit rules are already enabled in **ruff** via the `S` rule-set (flake8-bandit) — see `pyproject.toml`. A separate bandit run for CI is not required in most cases.
- If a deeper security scan beyond ruff `S` is needed:
  ```bash
  uv add --group dev bandit
  uv run bandit -r app/
  ```
  Not currently wired into the `Makefile` — add it only when there's a real need.
