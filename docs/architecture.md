# Архитектура проекта

Проект использует **доменную архитектуру (Domain-Driven Design)** с разделением по доменам, а не по слоям. Это позволяет группировать весь код, относящийся к одной сущности, в одном месте.

## Структура проекта

```text
app/
  shared/                          # Общая инфраструктура — нарезана по вертикалям-интеграциям
    infra/
      di/                          # DI-каркас
        base.py                    # BaseComponent (lifecycle: startup/shutdown)
        registry.py                # ComponentRegistry (типизированный store)
        exceptions.py              # ComponentNotRegisteredError
      postgres/                    # ВСЁ про SQLAlchemy в одном пакете
        component.py               # SqlAlchemyComponent + SessionMaker
        uow.py                     # BaseUnitOfWork
        dependency.py              # db_session_dependency
      procrastinate/               # ВСЁ про procrastinate
        component.py               # ProcrastinateComponent + ProcrastinateApp
        bus.py                     # TaskBus + SessionBoundTaskBus
        bus_component.py           # TaskBusComponent
      email/                       # ВСЁ про email transport
        component.py               # ResendComponent
        transport.py               # EmailTransport (Protocol)
        resend_client.py           # ResendClient
        schemas.py                 # EmailMessage
      http/                        # Базовый HTTP-клиент (используют email и др.)
        client.py                  # BaseHTTPClient
        config.py                  # HTTPClientConfig
        exceptions.py              # ExternalAPI*Error
      jwt/
        service.py                 # JWTService + JWTDecodeError
      crypto/
        protocol.py                # SecretHasher (Protocol)
        argon2.py                  # Argon2SecretHasher
    logging/                       # Логирование как самостоятельная вертикаль
      config.py                    # configure_logging, get_logger
      context.py                   # build_log_context, build_error_log_context
      classify.py                  # get_log_level_for_exception, get_status_code_from_exception
      events.py                    # get_event_name
      middleware.py                # HTTPLoggingMiddleware
    repositories/
      base_repository.py           # Базовый репозиторий
    exceptions/                    # Общие исключения
    utils/                         # Узкие утилиты (file_reader, json_serializer)
    settings.py                    # Настройки приложения
    types.py                       # Общие типы
    enums.py                       # Общие перечисления

  users/                          # Домен Users
    domain/                        # Ядро - бизнес-логика (не зависит ни от чего)
      entities.py                  # UserEntity (чистая бизнес-логика)
      value_objects.py            # Email, PasswordHash и т.д.
      repository.py                # Интерфейс IUserRepository (абстракция)
    
    infra/                        # Реализация инфраструктуры
      models.py                    # User (table=True) - SQLModel модель БД
      repositories.py              # UserRepository - реализация IUserRepository
      user_uow.py
    
    application/                   # Use cases / бизнес-операции
      schemas.py                   # DTOs для бизнес-операций: UserCreateDTO, UserUpdateDTO, UserDTO
      services.py                  # UserService (use cases)
    
    presentation/                  # API слой
      schemas.py                   # API схемы: UserCreateRequest, UserResponse (HTTP-специфичные)
      routes.py                    # user_routes (использует presentation/schemas.py)
      dependencies.py              # специфичные зависимости для users
      mappers.py                   # Преобразование presentation -> application и обратно

  auth/                           # Домен Auth
    domain/
      entities.py
      repository.py
    infra/
      models.py
      repositories.py
    application/
      schemas.py                   # AuthTokenCreate, AuthTokenPublic и т.д.
      services.py
    presentation/
      routes.py
      dependencies.py

  # ... другие домены
```

## Принципы организации

1. **Domain слой** - чистая бизнес-логика, не зависит от инфраструктуры
2. **Infrastructure слой** - реализация репозиториев и моделей БД
3. **Application слой** - use cases, сервисы и DTOs для бизнес-операций
4. **Presentation слой** - API схемы (request/response), роуты и мапперы для преобразования между слоями

**Важно:** Presentation слой имеет свои схемы, чтобы избежать протечки абстракций. Presentation схемы преобразуются в Application DTOs через мапперы.

## Преимущества такой структуры

- **Высокая связность** - весь код, относящийся к одной сущности, в одном месте
- **Низкая связанность** - домены изолированы друг от друга
- **Проще масштабировать** - можно выделить домен в отдельный микросервис
- **Проще навигация** - все про User находится в `app/users/`
- **Командная работа** - разные команды могут работать над разными доменами
- **Изоляция слоев** - presentation схемы отделены от application DTOs, предотвращает протечку абстракций
- **Гибкость** - можно добавить другой presentation слой (GraphQL, gRPC) без изменения application слоя
