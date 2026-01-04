# MindTrace

## Архитектура проекта

Проект использует **доменную архитектуру (Domain-Driven Design)** с разделением по доменам, а не по слоям. Это позволяет группировать весь код, относящийся к одной сущности, в одном месте.

### Структура проекта

```
app/
  shared/                          # Общие компоненты (инфраструктура)
    infra/
      components/                  # БД, Redis и другие инфраструктурные компоненты
        postgres.py                # SqlAlchemyComponent
        registry.py                # ResourceRegistry
      uow/
        base_uow.py                # Базовый UnitOfWork
    repositories/
      base_repository.py           # Базовый репозиторий
    exceptions/                    # Общие исключения
    utils/                         # Общие утилиты
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

### Принципы организации

1. **Domain слой** - чистая бизнес-логика, не зависит от инфраструктуры
2. **Infrastructure слой** - реализация репозиториев и моделей БД
3. **Application слой** - use cases, сервисы и DTOs для бизнес-операций
4. **Presentation слой** - API схемы (request/response), роуты и мапперы для преобразования между слоями

**Важно:** Presentation слой имеет свои схемы, чтобы избежать протечки абстракций. Presentation схемы преобразуются в Application DTOs через мапперы.

### Преимущества такой структуры

- **Высокая связность** - весь код, относящийся к одной сущности, в одном месте
- **Низкая связанность** - домены изолированы друг от друга
- **Проще масштабировать** - можно выделить домен в отдельный микросервис
- **Проще навигация** - все про User находится в `app/users/`
- **Командная работа** - разные команды могут работать над разными доменами
- **Изоляция слоев** - presentation схемы отделены от application DTOs, предотвращает протечку абстракций
- **Гибкость** - можно добавить другой presentation слой (GraphQL, gRPC) без изменения application слоя

## Просмотр логов из Loki

Логи приложения собираются в Loki через Promtail. Для просмотра логов можно использовать curl запросы к Loki API.

### Базовые команды

#### Проверка доступности Loki
```bash
curl http://localhost:3100/ready
```

#### Получить список всех меток
```bash
curl -s "http://localhost:3100/loki/api/v1/labels" | jq
```

#### Получить список всех контейнеров
```bash
curl -s "http://localhost:3100/loki/api/v1/label/container/values" | jq
```

### Формат логов

Логи приложения выводятся в формате JSON со следующими полями:

```json
{
  "endpoint": "/v1/messages/",
  "event": "Получен запрос на создание сообщения",
  "level": "info",
  "logger": "app.routes.v1.message",
  "timestamp": "2025-12-28T09:47:56.557145Z"
}
```

**Доступные поля для фильтрации:**
- `level` - уровень лога (debug, info, warning, error, critical)
- `logger` - имя логгера (например, `app.routes.v1.message`)
- `event` - основное сообщение лога
- `timestamp` - время события в ISO формате
- `endpoint` - endpoint API (если указан при логировании)
- Другие поля, добавленные при вызове логгера (например, `user_id`, `request_id` и т.д.)

### Запросы логов

#### Все логи приложения за последний час
```bash
curl -G -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={container="mindtrace_app"}' \
  --data-urlencode "start=$(($(date +%s) - 3600))000000000" \
  --data-urlencode "end=$(date +%s)000000000" \
  --data-urlencode 'limit=100' | jq -r '.data.result[]?.values[]?[1]'
```

#### Поиск по тексту
```bash
curl -G -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={container="mindtrace_app"} |= "Получен запрос"' \
  --data-urlencode "start=$(($(date +%s) - 3600))000000000" \
  --data-urlencode "end=$(date +%s)000000000" \
  --data-urlencode 'limit=50' | jq -r '.data.result[]?.values[]?[1]'
```

#### Логи с определенным endpoint
```bash
curl -G -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={container="mindtrace_app"} | json | endpoint="/v1/messages/"' \
  --data-urlencode "start=$(($(date +%s) - 3600))000000000" \
  --data-urlencode "end=$(date +%s)000000000" \
  --data-urlencode 'limit=50' | jq -r '.data.result[]?.values[]?[1]'
```

#### Логи по уровню (INFO, WARNING, ERROR)
```bash
curl -G -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={container="mindtrace_app"} | json | level="info"' \
  --data-urlencode "start=$(($(date +%s) - 3600))000000000" \
  --data-urlencode "end=$(date +%s)000000000" \
  --data-urlencode 'limit=50' | jq -r '.data.result[]?.values[]?[1]'
```

#### Все логи всех контейнеров mindtrace
```bash
curl -G -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={app="mindtrace"}' \
  --data-urlencode "start=$(($(date +%s) - 3600))000000000" \
  --data-urlencode "end=$(date +%s)000000000" \
  --data-urlencode 'limit=100' | jq -r '.data.result[]?.values[]?[1]'
```

### Просмотр логов через Grafana

Grafana предоставляет графический интерфейс для просмотра и анализа логов из Loki.

#### Первоначальная настройка

1. **Запустите Grafana:**
   ```bash
   docker-compose up -d grafana
   ```

2. **Откройте Grafana в браузере:**
   - URL: `http://localhost:3000`
   - Логин: `admin`
   - Пароль: `admin` (при первом входе предложат сменить)

3. **Настройте подключение к Loki:**
   - Перейдите в **Configuration** → **Data Sources**
   - Нажмите **Add data source**
   - Выберите **Loki**
   - В поле **URL** укажите: `http://loki:3100`
   - Нажмите **Save & Test** (должно показать "Data source connected and labels found")

#### Использование Explore

1. Перейдите в **Explore** (иконка компаса слева)
2. Выберите источник данных **Loki**
3. Используйте LogQL запросы для фильтрации логов:
   - `{container="mindtrace_app"}` - все логи приложения
   - `{container="mindtrace_app"} | json | level="error"` - только ошибки
   - `{container="mindtrace_app"} | json | endpoint="/v1/messages/"` - логи по endpoint

#### Создание Dashboard

Можно создать дашборд с панелями для:
- Общее количество логов по уровням
- Логи по контейнерам
- График ошибок во времени
- Таблица последних логов

### Примечания

- Для работы команд требуется установленный `jq` (для форматирования JSON)
- Временные интервалы указываются в Unix timestamp в наносекундах
- `start` и `end` вычисляются динамически через `date +%s`
- Grafana доступна на порту `3000` после запуска