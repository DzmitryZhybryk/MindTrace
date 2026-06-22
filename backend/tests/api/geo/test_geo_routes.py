"""
api-тесты роута ``GET /v1/geo/places/search/`` на ASGI-приложении.

Реальная проводка ``place_service`` поверх фейк-репозитория, реальный декод Bearer-токена
(подписан settings-секретом через ``mint_access_token``). Пиннят camelCase-контракт ответа,
401 без токена и 422 на невалидные query-параметры.
"""

from collections.abc import Callable
from uuid import UUID, uuid4

from httpx import AsyncClient

from tests.builders import make_place
from tests.fakes import FakePlaceRepository

_SEARCH_PATH = "/v1/geo/places/search/"


async def test_search_places_returns_camelcase_candidates(
    client: AsyncClient,
    fake_place_repository: FakePlaceRepository,
    mint_access_token: Callable[..., str],
) -> None:
    """200: имена резолвятся под язык, ответ camelCase (placeId/countryCode), порядок по населению."""
    moscow = make_place(en="Moscow", ru="Москва", country_code="RU", population=10_000_000)
    mostar = make_place(en="Mostar", ru=None, country_code="BA", population=100_000)
    fake_place_repository.places.extend([mostar, moscow])

    response = await client.get(
        _SEARCH_PATH,
        params={"searchText": "Mos", "language": "ru", "limit": 10},
        headers={"Authorization": f"Bearer {mint_access_token(uuid4())}"},
    )

    assert response.status_code == 200
    items = response.json()["items"]
    assert [item["name"] for item in items] == ["Москва", "Mostar"]
    first = items[0]
    assert UUID(first["placeId"]) == moscow.place_id
    assert first["countryCode"] == "RU"
    assert "place_id" not in first
    assert "country_code" not in first


async def test_search_places_without_token_returns_401(client: AsyncClient) -> None:
    """401: запрос без Bearer-токена отклоняется с доменным кодом auth.invalid_access_token."""
    response = await client.get(_SEARCH_PATH, params={"searchText": "Mos", "language": "en"})

    assert response.status_code == 401
    assert response.json()["code"] == "auth.invalid_access_token"


async def test_search_places_missing_language_returns_422(
    client: AsyncClient,
    mint_access_token: Callable[..., str],
) -> None:
    """422: обязательный query-параметр language отсутствует → validation_error."""
    response = await client.get(
        _SEARCH_PATH,
        params={"searchText": "Mos"},
        headers={"Authorization": f"Bearer {mint_access_token(uuid4())}"},
    )

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"
