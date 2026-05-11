# Changelog

<!-- markdownlint-disable-file MD024 -->

Все заметные изменения в этом проекте документируются в этом файле.

Формат версий соответствует [SemVer](https://semver.org/lang/ru/).

## [0.9.0] 2026-05-11

### Добавлено

- Эндпоинты `/v1/auth/login/`, `/v1/auth/logout/`, `/v1/auth/refresh/` — полный flow аутентификации с access-JWT и refresh-cookie
- Ротация refresh-токена с reuse detection (OAuth 2.1): использование уже отозванного токена инвалидирует все активные сессии пользователя
- Shared-компонент `DeterministicHasher` (`app/shared/infra/crypto/`) с реализацией `Sha256DeterministicHasher` — для index-lookup по детерминированному hash'у

### Изменено

- Refresh-токены хранятся как `token_hash` (SHA-256) с unique-индексом; в cookie уходит plaintext-секрет, БД компрометация не даёт rerun'нуть существующие сессии
- Из `RefreshTokenEntity` убран `last_seen_at` — его роль закрывает `updated_at` от `TimestampedEntityMixin`

## [0.8.1] 2026-05-10

### Добавлено

- `TaskBus` / `SessionBoundTaskBus` в `app/shared/infra/procrastinate/` — atomic defer procrastinate-таски в SA-транзакции через `task_bus.bind_to(uow.session).defer(...)`

### Изменено

- Реструктуризация `app/shared/` по вертикалям-интеграциям: `infra/{di, postgres, procrastinate, email, http, jwt, crypto}` + `shared/logging/`. Старые папки `infra/components/`, `infra/clients/`, `shared/middlewares/`, `shared/dependencies/` удалены

### Исправлено

- `HTTPLoggingMiddleware`: 5xx ответы теперь логируются как `error` (раньше `warning`)

## [0.8.0] 2026-05-10

### Добавлено

- Подтверждение email: эндпоинты `/v1/auth/email/send-verification/` и `/v1/auth/email/verify/`
- Асинхронная отправка писем через `procrastinate` + Resend (новый worker-контейнер)
- JWT-claim `email_verified` в access-токене

### Изменено

- Глобальный exception handler: 4xx-ошибки теперь корректно возвращают доменный JSON вместо 500

## [0.7.0] 2025-05-02

### Добавлено

- Главная страница приожения на frontend

## [0.6.0] 2025-05-02

### Добавлено

- Регистрация пользователя
- Домены `auth` + `users`

## [0.5.0] 2025-12-30

### Добавлено

- Глобальная обработка `Exceptions`
- `Middlewares` для базовых логов и `Exceptions`

## [0.4.0] 2025-12-30

### Добавлено

- Логирование при помощи `structlog`

## [0.3.0] 2025-12-20

### Добавлено

- `Docker`, `docker-compose`
- Миграции `alembic`
- Компонент для `postgresql`
- Модель `users`

## [0.2.0] 2025-12-19

### Добавлено

- Линтеры `ruff`, `ty`
- `Makefile` и `Changelog`

## [0.1.0] 2025-12-18

### Добавлено

- Инициализация проекта
