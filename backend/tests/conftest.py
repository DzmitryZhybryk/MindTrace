"""
Корневой conftest тест-suite.

Содержит две инфраструктурные вещи на весь suite:

1. **Bootstrap настроек** — цикл ``os.environ.setdefault`` ниже выполняется на
   импорте conftest, то есть **до** импорта любого ``app``-модуля. Почти любой
   импорт ``app`` тянет ``app.shared.settings.settings`` (синглтон строится на
   импорте, ``@cache`` + ``frozen``), которому нужны обязательные поля ``Settings``.
   Значения — мусорные заглушки, чтобы ``Settings()`` не падал на коллекции;
   unit-тесты читают конфиг из конструктора, а не из синглтона (см.
   ``.claude/rules/python/testing.md``). ``setdefault`` оставляет приоритет за
   реальным окружением/CI.
2. **Авто-маркировка** — хук ``pytest_collection_modifyitems`` проставляет маркеры
   по пути файла (подробности — в его докстринге).
"""

import os

import pytest

_TEST_ENV_DEFAULTS = {
    "POSTGRES_USER": "test",
    "POSTGRES_PASSWORD": "test",
    "POSTGRES_DB": "test",
    "HOST": "localhost",
    "PORT": "8000",
    "ENVIRONMENT": "local",
    "JWT_SECRET_KEY": "test-secret-key",
    "RESEND_API_KEY": "test-resend-key",
    "RESEND_FROM_EMAIL": "test@example.com",
}

for _key, _value in _TEST_ENV_DEFAULTS.items():
    os.environ.setdefault(_key, _value)


# Оси маркеров, выводимые из пути файла: tests/<level>/<domain>/...
# При добавлении нового уровня/домена обнови и эти кортежи, и список ``markers`` в
# pyproject.toml (``--strict-markers`` запрещает незарегистрированные маркеры).
_LEVEL_MARKERS = ("unit", "integration", "api")
_DOMAIN_MARKERS = ("auth", "users", "shared")


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    """
    Автоматически проставляет тестам маркеры уровня и домена по пути файла.

    Каталог ``tests/<уровень>/<домен>/...`` уже кодирует две оси, по которым мы
    хотим запускать тесты выборочно: уровень (``unit``/``integration``/``api``) и
    домен (``auth``/``users``/``shared``). На этапе сбора хук смотрит ``nodeid``
    каждого теста и, если сегмент пути совпадает с известным маркером, навешивает
    его. Благодаря этому маркеры в самих тест-файлах ставить **не нужно** — и их
    нельзя забыть: разметка следует из расположения файла, а не из ручных
    декораторов (забытый ручной маркер молча выкинул бы тест из выборки).

    Маркеры pytest композируются булевой логикой, поэтому доступна выборка по любой
    комбинации осей:

    - ``pytest -m unit`` / ``make test-unit`` — все юнит-тесты (любой домен);
    - ``pytest -m users`` / ``make test-users`` — все тесты домена users (любой уровень);
    - ``pytest -m "unit and users"`` / ``make test-m M="unit and users"`` — пересечение.

    Args:
        items: Собранные pytest'ом тест-элементы; маркеры добавляются in-place.
    """
    known_markers = (*_LEVEL_MARKERS, *_DOMAIN_MARKERS)
    for item in items:
        path_segments = item.nodeid.split("/")
        for marker_name in known_markers:
            if marker_name in path_segments:
                item.add_marker(getattr(pytest.mark, marker_name))
