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
make check                                # полный гейт обеих сторон (lint + typecheck + тесты + бюджет правил Claude)
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

Frontend — из `frontend/`: `npm install`, `npm run dev`, `make lint | typecheck | test | coverage | check | budget | mantine-styles`.
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

Правила по путям подгружаются сами — пути заданы в `paths:` их frontmatter. Раздел CLAUDE.md не дублирует их;
при конфликте с правилом побеждает более специфичный источник — само правило.

### Всегда в контексте

| Файл | О чём |
|---|---|
| `.claude/rules/common/coding-style.md` | KISS/DRY, иммутабельность, размеры файлов и функций, нейминг |
| `.claude/rules/common/security.md` | чек-лист безопасности перед коммитом, секреты |
| `.claude/rules/common/decisions.md` | оглавление принятых решений (`.claude/decisions/`): что прочитать, прежде чем менять область |

### Rules по путям

| Файл | О чём |
|---|---|
| `python/code-style.md` | ruff/ty, докстринги, named arguments, `Self`, повседневные соглашения |
| `python/security.md` | pydantic-settings, `SecretStr`, bandit через ruff |
| `python/ddd.md` | слои, раскладка `schemas/` и `ports/`, порты (DIP), UoW, soft-delete, нейминг репозиториев и entity |
| `python/use-case-helpers.md` | когда кусок use case выносится из тела, куда (domain, приватный метод, модуль, `shared/utils`) и как назвать |
| `python/dto.md` | `*Command`/`*Result`/`*Request`/`*Response`, роли параметров use case (actor/target/payload/metadata), объекты портов (`*Scope`/`*Filters`), pydantic vs dataclass, типы коллекций, где валидация |
| `python/shared-infrastructure.md` | вертикали `shared/`, исключения, паттерны composition root, `TaskBusPort` |
| `python/component-lifecycle.md` | component+registry против `@cache`-фабрики |
| `python/testing.md` | философия, fakes, детерминизм, reuse-before-create |
| `python/testing-layout.md` | пирамида, раскладка, маркеры, где живут фикстуры, покрытие, таргеты |
| `typescript/coding-style.md` | типы, React, zod, нейминг, комментарии (только English) |
| `typescript/error-display.md` | как показывать ошибки в формах; токен, а не готовый текст |
| `typescript/testing.md` | классицизм, мок только сети, детерминизм, конвенции |
| `typescript/testing-environment.md` | пирамида, jsdom-квирки, ловушки, раскладка, CI, e2e |
| `web/ui-design.md` | любой дизайн или переделка вида UI начинается с вызова `frontend-design:frontend-design` |
| `web/performance.md` | Web Vitals, бюджет бандла, загрузка, картинки, шрифты, ручные UI-проверки |
| `common/codegen-contract.md` | дрейф-гейты, пин генератора, границы стран |

`python/ddd.md`, `python/dto.md`, `python/component-lifecycle.md`, `python/use-case-helpers.md` — копии личных конвенций: канон лежит в
`~/.claude/optional/rules/python/`. Правишь канон — перекопируй сюда и верни строку `paths:` во frontmatter.

### Skills

| Skill | Когда |
|---|---|
| `git-workflow` | commit, push, PR, ветка, версия, CHANGELOG, гейт покрытия |
| `dev-database` | миграции, `geo-load`, пересоздание дев-базы, psql/EXPLAIN по деву |
| `backend-tests` | написать или расширить backend-тесты |
| `style-audit` | проверка фронта на токен-политику дизайна |
| `seo-meta-tags` | `<head>` HTML-файлов |
| `dead-code-audit` | поиск и удаление мёртвого кода |
| `decision-records` | записать или изменить принятое решение; закрытие плана или задачи из `.plan/` |
| `frontend-design:frontend-design` (плагин) | проектирование нового UI и редизайн — вызывать сразу, без напоминания |
| глобальные | `/feature-plan`, `postgres` (дизайн схемы и запросов), `debugging`, `merge-review`, `graphify` |

### Агенты и ревью

- `architecture-reviewer` (глобальный, read-only) судит проект по политике из раздела «Архитектурная политика».
- Ревью кода — встроенные `/code-review` (баги в диффе) и `/security-review`. Механику ловят `make lint` / `make typecheck`.
- Задачи и планы — `.plan/` в корне (сам себя исключает из git), файл на задачу: прямо в `.plan/` — планы
  `/feature-plan`; `todo/` — в работу, `before-prod/` — к разворачиванию прода, `conditional/` — когда
  наступит условие, `ideas/` — идеи без обязательств. Сделанная задача удаляется — история в `CHANGELOG.md`.
