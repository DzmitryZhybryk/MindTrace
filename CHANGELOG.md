# Changelog

<!-- markdownlint-disable-file MD024 -->

Все заметные изменения в этом проекте документируются в этом файле.

Формат версий соответствует [SemVer](https://semver.org/lang/ru/).

## [0.9.3] 2026-05-24

### Изменено

- Таблицы переименованы во множественное число: `user`→`users`, `refresh_token`→`refresh_tokens`, `challenge`→`challenges` (единая конвенция именования; `users` заодно уходит от зарезервированного слова `user`)
- Синхронизированы длины полей FE/BE: на `/v1/auth/login/` логин и пароль валидируются только на непустоту (min 1), чтобы старые короткие пароли не блокировались на входе

### Исправлено

- FastAPI 422 (`RequestValidationError`) возвращается в едином `ErrorResponse` (`code: "validation_error"`, `details.fields`) вместо дефолтного `{"detail": [...]}` — фронт получает тот же контракт ошибки, что и для доменных исключений

## [0.9.2] 2026-05-17

### Изменено

- Унифицированы singleton-factories для stateless-инфры: `get_argon2_salted_hasher()` и `get_sha256_deterministic_hasher()` зеркалят существующий `get_jwt_service()`. Презентационные dependency-функции теперь импортируют factory вместо прямых конструкторов — больше нет дублей инстансов hasher'ов на запрос
- `EVENT_MAPPER` (`app/shared/logging/events.py`) актуализирован — устаревший `/v1/users/register` заменён на 6 actual auth-routes (register/login/logout/refresh/email send/email verify)
- `auth_blueprint` re-export через `app/auth/infra/__init__.py` — composition root (`main.py` + `worker.py`) больше не лезет в `infra/tasks.py` напрямую

### Удалено

- Пустая директория `app/users/presentation/` (router без endpoints, schemas/responses с пустыми `__all__`). DDD-нарезка users-домена сохраняется, presentation-слой добавится обратно, когда появится первый endpoint

### Исправлено

- Драйфт документации в `CLAUDE.md`: убран несуществующий `messages` домен, переписаны секции `crypto` (`SaltedHasher`/`DeterministicHasher` + factories) и `BaseDBRepository` (`_fetch_one`/`insert`), уточнено описание `Password` value object, добавлен раздел Component+Registry vs `@cache`-factory с критерием выбора

## [0.9.1] 2026-05-17

### Изменено

- Монолитный `AuthService` разделён на `AuthService` (register/login/logout/refresh) и `EmailVerificationService` (request/verify) — две application-роли в auth-домене, общий `AuthUnitOfWork`
- Выделен `TokenIssuer` (`app/auth/application/token_issuer.py`) — инкапсулирует выпуск refresh-секретов, их детерминированный hash и сборку `TokenPairResult`; `AuthService` больше не знает про JWT и hashing-детали
- Из `AuthServiceSettings` выделен `EmailVerificationSettings` (`app/auth/application/settings.py`) — `EmailVerificationService` получает только свой конфиг; параметры refresh-token'а живут примитивом в `TokenIssuer.__init__` (single-field конфиг не оборачиваем в settings-класс)
- Переименования в `app/shared/infra/crypto/`: `SecretHasher` → `SaltedHasher`, `Argon2SecretHasher` → `Argon2SaltedHasher` — имя протокола теперь зеркально `DeterministicHasher` по реальной property (salted vs deterministic), которая и определяет применимость
- Унифицированы singleton-factories для stateless-инфры: `get_argon2_salted_hasher()` и `get_sha256_deterministic_hasher()` зеркалят существующий `get_jwt_service()` — больше нет дублирования инстансов hasher'ов между dependency-функциями

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
