---
paths:
  - "backend/**/*.py"
---

# Python code style (`backend/`)

Extends `common/coding-style.md`. Layers and naming — `ddd.md`; transfer objects and collection
types — `dto.md`.

## Toolchain

- **ruff** is the single tool: lint (`make lint`), format (`make format`), import sorting. No Black,
  no isort. Line length 120, double quotes. The config is in `pyproject.toml`.
- **ty** is the type checker (`make typecheck`). mypy is not used.
- Cyrillic is allowed in strings, comments and user-facing error messages (RUF001-003 are ignored).
  Backend only: `frontend/` comments are English.

## Docstrings

Google style, written in Russian, with `Args:` and `Returns:` sections:

```python
def get_log_level_for_exception(exc: Exception) -> int:
    """
    Определяет уровень логирования на основе типа исключения.

    Args:
        exc: Исключение

    Returns:
        Уровень логирования (logging.ERROR, logging.WARNING и т.д.)
    """
```

Keep them short and in plain language. A comment or docstring carries what the code does not show,
not a retelling of the decision, its history or metrics.

## Named arguments

**Call side:** pass every argument as a keyword.

```python
Password(hash=user_model.password)                    # not Password(user_model.password)
User(id=user_entity.user_id, email=user_entity.email)
```

**Declaration side:** a function, method or constructor with **more than one** parameter makes them
all keyword-only with `*`. A single parameter may stay positional. `self` / `cls` do not count.

```python
def decode_cursor(*, cursor: str, parsers: Sequence[CursorParser]) -> tuple[object, ...]: ...
def find_journey_years_by_user_id(self, user_id: UUID) -> tuple[int, ...]: ...
```

Exempt only signatures that something else calls **positionally**: framework hooks (pydantic
validators, Starlette exception handlers and middleware `dispatch`, procrastinate `pass_context`
tasks), pytest test functions and fixtures (fakes and helpers under `tests/` still follow the rule),
dunder protocol methods (`__eq__`, `__aexit__`; `__init__` is **not** exempt), callbacks passed to
`map` / `sorted` / `key=`, and `Protocol` methods mirroring a third-party API.

## `Self` return type

Use `typing.Self`, not a string literal:

```python
@model_validator(mode="after")
def validate_terms(self) -> Self: ...
```

## Blank line after a block

Leave a blank line after a closing `if` block or `for` loop before the next statement:

```python
if exc.category is ErrorCategory.INTERNAL:
    return logging.ERROR

for handler in registered_handlers:
    if handler.can_handle(exc):
        return handler

return default_handler
```

## Collection types

`list` is not the default; the type follows the meaning of the data. The table and the reasoning —
`dto.md` → "Immutable by default". Neighbouring code that still uses `list` is not a precedent.

## Recurring conventions

- Do **not** carve pieces of a use case into private `_helper` methods of the service: the code stays
  in the use case; shared pure logic goes to `shared/utils`. The one agreed exception: the same
  check-and-raise block repeated across several use cases of one service may become a private
  method (`JourneyService._find_route_points`). Hiding the steps of a single use case is still out.
- Do **not** alias a repository (`repository = self._uow.x_repository`); always call
  `self._uow.x_repository.method(...)` directly.
- A single-row `find` in a repository ends with a ternary `self._to_entity(...) if model else None`,
  not an early return. Before adding a method to a layer, grep its neighbours and repeat their shape.
- Use `DictStrAny` and the other aliases from `app.shared.types` instead of inline `dict[str, Any]`.
- An entity's `updated_at` is touched through the existing `TimestampedEntityMixin._mark_updated()`,
  not by hand-written `touch_*` / `mark_modified` methods.
- External API clients carry the `Client` suffix (`ResendClient`); the word `Transport` belongs only
  to `Protocol` roles.
