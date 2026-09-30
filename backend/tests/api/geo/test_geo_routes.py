"""
api-тесты роутов geo на ASGI-приложении: ``GET /v1/geo/places/search/`` и
``POST /v1/geo/places/resolve``.

Реальная проводка ``place_service`` поверх фейк-репозитория, реальный декод Bearer-токена
(подписан settings-секретом через ``mint_access_token``). Пиннят camelCase-контракт ответа,
401 без токена и 422 на невалидный ввод.
"""

from collections.abc import Callable
from uuid import UUID, uuid4

from httpx import AsyncClient

from tests.builders import make_place
from tests.fakes import FakePlaceRepository

_SEARCH_PATH = "/v1/geo/places/search/"
_RESOLVE_PATH = "/v1/geo/places/resolve"


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


async def test_search_places_one_char_query_returns_422(
    client: AsyncClient,
    mint_access_token: Callable[..., str],
) -> None:
    """422: поиск по одному символу отклоняется — минимум два."""
    response = await client.get(
        _SEARCH_PATH,
        params={"searchText": "M", "language": "en"},
        headers={"Authorization": f"Bearer {mint_access_token(uuid4())}"},
    )

    assert response.status_code == 422


async def test_resolve_places_returns_names_and_omits_unknown(
    client: AsyncClient,
    fake_place_repository: FakePlaceRepository,
    mint_access_token: Callable[..., str],
) -> None:
    """200: названия на языке запроса в camelCase, неизвестный id в ответ не попадает."""
    moscow = make_place(en="Moscow", ru="Москва")
    fake_place_repository.places.append(moscow)

    response = await client.post(
        _RESOLVE_PATH,
        json={"placeIds": [str(moscow.place_id), str(uuid4())], "language": "ru"},
        headers={"Authorization": f"Bearer {mint_access_token(uuid4())}"},
    )

    assert response.status_code == 200
    assert response.json() == {"items": [{"placeId": str(moscow.place_id), "name": "Москва"}]}


async def test_resolve_places_without_token_returns_401(client: AsyncClient) -> None:
    """401: запрос названий без Bearer-токена отклоняется."""
    response = await client.post(_RESOLVE_PATH, json={"placeIds": [str(uuid4())], "language": "en"})

    assert response.status_code == 401
    assert response.json()["code"] == "auth.invalid_access_token"


async def test_resolve_places_empty_list_returns_422(
    client: AsyncClient,
    mint_access_token: Callable[..., str],
) -> None:
    """422: пустой список id — нечего спрашивать."""
    response = await client.post(
        _RESOLVE_PATH,
        json={"placeIds": [], "language": "en"},
        headers={"Authorization": f"Bearer {mint_access_token(uuid4())}"},
    )

    assert response.status_code == 422


async def test_resolve_places_more_than_1000_ids_returns_422(
    client: AsyncClient,
    mint_access_token: Callable[..., str],
) -> None:
    """422: больше 1000 id за запрос — фронт обязан резать список на части."""
    response = await client.post(
        _RESOLVE_PATH,
        json={"placeIds": [str(uuid4()) for _ in range(1001)], "language": "en"},
        headers={"Authorization": f"Bearer {mint_access_token(uuid4())}"},
    )

    assert response.status_code == 422


async def test_resolve_places_accepts_exactly_1000_ids(
    client: AsyncClient,
    mint_access_token: Callable[..., str],
) -> None:
    """200: ровно 1000 id — это ещё в пределах лимита, по которому фронт режет список."""
    response = await client.post(
        _RESOLVE_PATH,
        json={"placeIds": [str(uuid4()) for _ in range(1000)], "language": "en"},
        headers={"Authorization": f"Bearer {mint_access_token(uuid4())}"},
    )

    assert response.status_code == 200
