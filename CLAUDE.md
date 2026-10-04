# CLAUDE.md

Guidance для Claude Code (claude.ai/code) при работе с этим репозиторием. Здесь — только то, что
нужно в каждой сессии. Конвенции по областям лежат в `.claude/rules/` и подгружаются сами, когда
Claude читает или правит подходящие файлы (frontmatter `paths:`); процедуры — в `.claude/skills/`.
Карта — в конце файла.

## Project Overview

MindTrace — FastAPI-сервис (Python 3.14+, async), Domain-Driven Design. Менеджер пакетов — **uv**.
БД — PostgreSQL через SQLAlchemy 2.0 async (типизированный ORM: `DeclarativeBase` + `Mapped`/`mapped_column`).
Работает в Docker со стеком логов Loki/Promtail/Grafana. Фронтенд — Vite/React SPA.

### Архитектурная политика (осознанные решения владельца)

- **Монолит сейчас, готовность к распилу потом.** Любой домен должен извлекаться в отдельный сервис без редизайна. Cross-domain связи делаются явными и узкими (`InternalUsersClient` мимикрирует под будущую HTTP-границу). Связность оценивать против этой цели.
- **Overengineering допустим.** Пет-проект без дедлайна: нужен архитектурно чистый код, переживающий распил, а не прагматичные сокращения. Не предлагать «тебе это пока не нужно» — только если абстракция активно вредит (запутывает вместо прояснения).

## Repository layout

Монорепо из самодостаточных частей:

- **`backend/`** — FastAPI-сервис: `app`, `migrations`, `tests`, `pyproject.toml`, `uv.lock`, `Dockerfile`, `Makefile`. Самодостаточный uv-проект: backend-команды (`uv`, `make`, `pytest`) запускаются **из `backend/`**, venv — `backend/.venv`. Домены — каталоги в `backend/app/` (каждый: `domain/` `application/` `infra/` `presentation/`), общая инфраструктура — `backend/app/shared/`.
- **`frontend/`** — Vite/React SPA (свой `Dockerfile`, build context `./frontend`).
- **`ops/`** — оркестрация и инфра-конфиги: compose-файлы (dev, prod, e2e), `Caddyfile`, конфиги логирования. Compose запускается через `make`-таргеты (`--project-directory .`), поэтому пути внутри относятся к **корню** репо, а не к `ops/`.
- **Корень** — `.env` / `.env.example`, `Makefile`-оркестратор, `CHANGELOG.md`, `docs/`.

## Commands

Из корня репозитория:

```bash
docker network create mindtrace-network   # один раз, перед первым up
make run                                  # dev-стек: app + worker + postgres + frontend + logging
make be-<target>                          # любой backend-таргет (make be-lint, be-format)
make fe-<target>                          # любой frontend-таргет (make fe-lint, fe-check)
make check                                # полный гейт обеих сторон (lint + typecheck + тесты)
make test                                 # быстрые тесты обеих сторон, без Docker
make test-infra                           # тяжёлые: backend integration + frontend e2e (нужен Docker-демон)
make test-e2e                             # frontend e2e на одноразовом стеке; дев-база не трогается
make test-e2e-dev                         # e2e по поднятому дев-стеку — быстро, но ПИШЕТ В ДЕВ-БАЗУ
```

Backend — из `backend/`:

```bash
uv sync                          # зависимости в backend/.venv
uv run python -m app             # запуск приложения локально
make format | lint | typecheck   # ruff fix+format, ruff lint, ty
make test                        # unit + api, без Docker
make coverage                    # то же + покрытие
make test-integration            # нужен Docker (testcontainers)
uv run pytest tests/path/test_file.py          # один файл
uv run pytest -k "test_name"                   # один тест по имени
```

Frontend — из `frontend/`: `npm install`, `npm run dev`, `make lint | typecheck | test | coverage | check | budget`.
Полный список таргетов — `make help` в соответствующем каталоге. Миграции, дев-база, `geo-load` —
skill `dev-database`. Контракт API (`openapi.json` → сгенерированный SDK) — правило
`.claude/rules/common/codegen-contract.md`.

## Git

Любой commit, push, PR, ветка, бамп версии или запись в CHANGELOG — сначала skill **`git-workflow`**
(формат коммитов, раздельное версионирование фронта и бэка, `uv lock`, гейт покрытия 90%).
Обход pre-commit hook'а через `--no-verify` — не вариант.

## UI

Проектирование нового экрана или компонента и любая переделка внешнего вида фронта — сначала skill
**`frontend-design:frontend-design`**, сразу, до разметки и без напоминания. Реальной страницей в
фича-ветке, не прототипом в `/sandbox`.

## Карта: что где лежит

Правила подгружаются автоматически по путям (колонка «Грузится»). Раздел CLAUDE.md не дублирует их;
при конфликте с правилом побеждает более специфичный источник — само правило.

### Всегда в контексте

| Файл | О чём |
|---|---|
| `.claude/rules/common/coding-style.md` | KISS/DRY, иммутабельность, размеры файлов и функций, нейминг |
| `.claude/rules/common/security.md` | чек-лист безопасности перед коммитом, секреты |

### Rules по путям

| Файл | Грузится при работе с | О чём |
|---|---|---|
| `python/code-style.md` | `backend/**/*.py` | ruff/ty, докстринги, named arguments, `Self`, повседневные соглашения |
| `python/security.md` | `backend/**/*.py` | pydantic-settings, `SecretStr`, bandit через ruff |
| `python/ddd.md` | `backend/app/**` | слои, порты (DIP), UoW, soft-delete, нейминг репозиториев и entity |
| `python/dto.md` | `backend/app/**` | `*Command`/`*Result`/`*Request`/`*Response`, pydantic vs dataclass, типы коллекций, где валидация |
| `python/shared-infrastructure.md` | `backend/app/**` | вертикали `shared/` и их импорты, иерархия исключений, composition root, `TaskBusPort` |
| `python/component-lifecycle.md` | `backend/app/shared/**`, `main.py` | component+registry против `@cache`-фабрики |
| `python/testing.md` | `backend/tests/**` | философия, fakes, детерминизм, reuse-before-create |
| `python/testing-layout.md` | `backend/tests/**` | пирамида, раскладка, маркеры, где живут фикстуры, покрытие, таргеты |
| `typescript/coding-style.md` | `frontend/**/*.ts(x)` | типы, React, zod, нейминг, комментарии (только English) |
| `typescript/error-display.md` | `frontend/src/**/*.tsx` | как показывать ошибки в формах; токен, а не готовый текст |
| `typescript/testing.md` | тесты и `e2e/` фронта | классицизм, мок только сети, детерминизм, конвенции |
| `typescript/testing-environment.md` | тесты, vite/playwright-конфиги | пирамида, jsdom-квирки, раскладка, CI, e2e |
| `web/ui-design.md` | `frontend/src/**/*.tsx`, `*.css` | любой дизайн или переделка вида UI начинается с вызова `frontend-design:frontend-design` |
| `web/performance.md` | `frontend/src/**` | Web Vitals, бюджет бандла, загрузка, картинки, шрифты, ручные UI-проверки |
| `common/codegen-contract.md` | `openapi.json`, `generated/`, CI | дрейф-гейты, пин генератора, границы стран |

`python/ddd.md`, `python/dto.md`, `python/component-lifecycle.md` — личные конвенции: в git не попадают
(`.gitignore`), канон лежит в `~/.claude/optional/rules/python/`, здесь рабочая копия. Правишь канон —
перекопируй сюда и верни строку `paths:` во frontmatter. У клонировавшего репо этих файлов нет — конвенции
при этом видны по коду.

### Skills

| Skill | Когда |
|---|---|
| `git-workflow` | commit, push, PR, ветка, версия, CHANGELOG, гейт покрытия |
| `dev-database` | миграции, `geo-load`, пересоздание дев-базы, psql/EXPLAIN по деву |
| `backend-tests` | написать или расширить backend-тесты |
| `style-audit` | проверка фронта на токен-политику дизайна |
| `seo-meta-tags` | `<head>` HTML-файлов |
| `dead-code-audit` | поиск и удаление мёртвого кода |
| `frontend-design:frontend-design` (плагин) | проектирование нового UI и редизайн — вызывать сразу, без напоминания |
| глобальные | `/feature-plan`, `postgres` (дизайн схемы и запросов), `debugging`, `merge-review`, `graphify` |

### Агенты и ревью

- `architecture-reviewer` (глобальный, read-only) судит проект по политике из раздела «Архитектурная политика».
- Ревью кода — встроенные `/code-review` (баги в диффе) и `/security-review`. Механику ловят `make lint` / `make typecheck`.
- Бэклог отложенных фич — `docs/feature-backlog.md`.
