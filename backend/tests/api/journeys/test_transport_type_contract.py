"""
Кросс-стек контракт публикуемого набора ``transport_type``.

Пиннит значения enum'а ``TransportType`` ровно так, как они уходят клиенту в OpenAPI-схеме
тела ``POST /v1/journeys/``. Это половина контракта; вторая половина — фронтовый
``frontend/src/api/journeys.test.ts``, пиннящий тот же набор у string-literal union'а
``TransportType``. Обе стороны привязаны к одному литералу ``{land, air, water}`` (он и есть
контракт): при изменении домена этот тест краснеет и напоминает синхронизировать фронт —
union, иконки ``TRANSPORT_ICONS`` и подписи в ``locales/{en,ru}/journeys.json``.

Набор закрытый (среда передвижения, не вид транспорта), меняется почти никогда — поэтому
тиринг-генерация типов из OpenAPI здесь оверкилл, а тонкого tripwire с обеих сторон достаточно.
"""

from app.journeys.presentation.routes import journey_router
from app.shared.schemas.base import BFastAPI

# Контракт: значения совпадают с фронтовым union TransportType (frontend/src/api/journeys.ts).
_EXPECTED_TRANSPORT_TYPES = {"land", "air", "water"}


def test_openapi_publishes_expected_transport_types(api_app: BFastAPI) -> None:
    """OpenAPI тела POST /v1/journeys/ публикует ровно {land, air, water} для transport_type."""
    api_app.include_router(journey_router, prefix="/v1/journeys")

    schema = api_app.openapi()

    transport_enum = set(schema["components"]["schemas"]["TransportType"]["enum"])
    assert transport_enum == _EXPECTED_TRANSPORT_TYPES
