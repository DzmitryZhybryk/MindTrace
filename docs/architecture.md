# Архитектура проекта

Бэкенд (`backend/app/`) построен по **Domain-Driven Design**: нарезка по доменам (`auth`, `users`), а не по слоям — весь код одной сущности собран в одном месте. Фронтенд (`frontend/`) — отдельный Vite/React SPA; весь стек поднимается из корня одной командой (`docker compose up -d`).

> **Детальная структура и конвенции — в [`CLAUDE.md`](../CLAUDE.md)** (секции «Architecture», «Shared infrastructure», «DTO conventions», «Service Result / Command convention», «Cводная таблица именования по слоям», «Versioning & changelog»). Это единый источник истины.
>
> **Дерево файлов здесь намеренно не дублируется.** Оно выводится из кода (`find backend/app`, `grep`) и в ручной доке быстро устаревает — поэтому актуальную структуру всегда смотри в самом коде, а не в этом файле. Этот документ держит только то, что из кода *не* выводится: принципы и причины.

## Слои домена

Каждый домен самодостаточен и делится на четыре слоя:

1. **domain/** — чистая бизнес-логика: entities, value objects. Без инфраструктурных импортов.
2. **infra/** — SQLAlchemy-модели БД, репозитории, UnitOfWork, внешние клиенты.
3. **application/** — use cases (`*Service`), входы `*Command`, результаты `*Result`.
4. **presentation/** — HTTP-схемы (`*Request` / `*Response`), роуты, dependencies.

Presentation-схемы отделены от application-DTO, чтобы не протекали абстракции; конверсия — одной строкой в route (`model_validate(..., from_attributes=True)`), без отдельного слоя мапперов.

## Почему так

- **Высокая связность / низкая связанность** — домены изолированы, код сущности собран вместе.
- **Масштабирование** — домен можно вынести в отдельный микросервис без переписывания.
- **Гибкость транспорта** — можно добавить GraphQL/gRPC-presentation поверх тех же application-сервисов.

## Общая инфраструктура

`backend/app/shared/` нарезана **по вертикалям-интеграциям** (postgres, procrastinate, email, http, jwt, crypto, di, logging) — каждая интеграция самодостаточный пакет с lifecycle-компонентом, клиентами и протоколами. Критерий «Component+Registry vs `@cache`-factory» и разбор каждой вертикали — в `CLAUDE.md` → «Shared infrastructure».
