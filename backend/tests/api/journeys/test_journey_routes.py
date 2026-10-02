"""
api-тесты роутов journeys (``POST /v1/journeys/``, ``GET /v1/journeys/map``, ``/globe``,
``/movements``) на ASGI-приложении.

Реальная проводка ``journey_service`` поверх фейк-UoW, реальный декод Bearer-токена
(``mint_access_token`` подписывает settings-секретом; ``sub`` токена становится ``user_id``
поездки). Пиннят 201-payload-on-create, 401 без токена, 400 неизвестного места, 422 запроса,
сериализацию ответов карт (camelCase, без лишних полей) и то, что фильтры карты перемещений
из query доходят до репозитория.
"""

import datetime as dt
from collections.abc import Callable
from typing import Any
from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.geo.presentation.dependencies import place_repository_dependency
from app.journeys.application.schemas import MovementConnection, VisitedPlace
from app.journeys.domain.enums import TransportType
from app.journeys.presentation.dependencies import places_client_dependency
from app.shared.schemas.base import BFastAPI
from tests.builders import (
    LONDON_PLACE_ID,
    MOSCOW_PLACE_ID,
    make_geo_point,
    make_place,
)
from tests.fakes import (
    FakeJourneyRepository,
    FakeJourneyUnitOfWork,
    FakePlaceRepository,
    FakePlacesClient,
    MovementConnectionQuery,
)

_CREATE_PATH = "/v1/journeys/"
_MAP_PATH = "/v1/journeys/map"
_GLOBE_PATH = "/v1/journeys/globe"
_MOVEMENTS_PATH = "/v1/journeys/movements"
_MOSCOW = {"placeId": str(MOSCOW_PLACE_ID), "countryCode": "RU", "latitude": 55.75, "longitude": 37.62}
_LONDON = {"placeId": str(LONDON_PLACE_ID), "countryCode": "GB", "latitude": 51.5, "longitude": -0.12}
_VALID_BODY: dict[str, Any] = {
    "origin": _MOSCOW,
    "destination": _LONDON,
    "transportType": "air",
    "traveledYear": 2020,
}
_CURRENT_YEAR = dt.datetime.now(tz=dt.UTC).year


async def test_create_journey_returns_201_and_persists(
    client: AsyncClient,
    fake_journey_uow: FakeJourneyUnitOfWork,
    fake_journey_repository: FakeJourneyRepository,
    mint_access_token: Callable[..., str],
) -> None:
    """201: валидный payload-on-create создаёт поездку под user_id из токена, тело ответа пустое, commit один раз."""
    user_id = uuid4()

    response = await client.post(
        _CREATE_PATH,
        json=_VALID_BODY,
        headers={"Authorization": f"Bearer {mint_access_token(user_id=user_id)}"},
    )

    assert response.status_code == 201
    assert response.content == b""
    assert len(fake_journey_repository.journeys) == 1
    journey_entity = fake_journey_repository.journeys[0]
    assert journey_entity.user_id == user_id
    assert journey_entity.origin.place_id == MOSCOW_PLACE_ID
    assert journey_entity.destination.place_id == LONDON_PLACE_ID
    assert journey_entity.transport_type is TransportType.AIR
    assert journey_entity.traveled_year == 2020
    fake_journey_uow.commit_mock.assert_awaited_once()


async def test_create_journey_current_year_returns_201(
    client: AsyncClient,
    fake_journey_repository: FakeJourneyRepository,
    mint_access_token: Callable[..., str],
) -> None:
    """201: текущий год (по UTC) — граница «не в будущем», поездка создаётся."""
    response = await client.post(
        _CREATE_PATH,
        json={**_VALID_BODY, "traveledYear": _CURRENT_YEAR},
        headers={"Authorization": f"Bearer {mint_access_token(user_id=uuid4())}"},
    )

    assert response.status_code == 201
    assert fake_journey_repository.journeys[0].traveled_year == _CURRENT_YEAR


async def test_create_journey_without_token_returns_401(client: AsyncClient) -> None:
    """401: запрос без Bearer-токена отклоняется с доменным кодом auth.invalid_access_token."""
    response = await client.post(_CREATE_PATH, json=_VALID_BODY)

    assert response.status_code == 401
    assert response.json()["code"] == "auth.invalid_access_token"


@pytest.mark.parametrize(
    ("overrides", "expected_code", "expected_field"),
    [
        ({"destination": _MOSCOW}, "journeys.same_origin_destination", None),
        ({"traveledYear": _CURRENT_YEAR + 1}, "journeys.date_in_future", "year"),
    ],
)
async def test_create_journey_rejected_by_request_rules_returns_400(
    client: AsyncClient,
    fake_journey_repository: FakeJourneyRepository,
    mint_access_token: Callable[..., str],
    overrides: dict[str, Any],
    expected_code: str,
    expected_field: str | None,
) -> None:
    """400: правила схемы запроса отдают свой код journeys.*, а не общий 422; поездка не создаётся."""
    response = await client.post(
        _CREATE_PATH,
        json={**_VALID_BODY, **overrides},
        headers={"Authorization": f"Bearer {mint_access_token(user_id=uuid4())}"},
    )

    body = response.json()
    assert response.status_code == 400
    assert body["code"] == expected_code
    assert (body.get("details") or {}).get("field") == expected_field
    assert fake_journey_repository.journeys == []


async def test_create_journey_year_below_one_returns_422(
    client: AsyncClient,
    mint_access_token: Callable[..., str],
) -> None:
    """422: год меньше 1 — ограничение поля, общий validation_error."""
    response = await client.post(
        _CREATE_PATH,
        json={**_VALID_BODY, "traveledYear": 0},
        headers={"Authorization": f"Bearer {mint_access_token(user_id=uuid4())}"},
    )

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


async def test_create_journey_unknown_place_returns_400_with_missing_ids(
    client: AsyncClient,
    fake_journey_repository: FakeJourneyRepository,
    fake_places_client: FakePlacesClient,
    mint_access_token: Callable[..., str],
) -> None:
    """400: места нет в geo → journeys.unknown_place, ненайденные id в details.place_ids, поездка не создана."""
    fake_places_client.existing_place_ids.discard(LONDON_PLACE_ID)

    response = await client.post(
        _CREATE_PATH,
        json=_VALID_BODY,
        headers={"Authorization": f"Bearer {mint_access_token(user_id=uuid4())}"},
    )

    assert response.status_code == 400
    body = response.json()
    assert body["code"] == "journeys.unknown_place"
    assert body["details"] == {"place_ids": [str(LONDON_PLACE_ID)]}
    assert fake_journey_repository.journeys == []


async def test_create_journey_checks_places_through_real_geo_wiring(
    app: BFastAPI,
    make_async_client: Callable[[BFastAPI], AsyncClient],
    fake_journey_repository: FakeJourneyRepository,
    fake_place_repository: FakePlaceRepository,
    mint_access_token: Callable[..., str],
) -> None:
    """400: без подмены клиента мест проверка идёт через настоящую цепочку journeys → geo до репозитория geo."""
    app.dependency_overrides.pop(places_client_dependency)
    app.dependency_overrides[place_repository_dependency] = lambda: fake_place_repository
    fake_place_repository.places.append(make_place(place_id=MOSCOW_PLACE_ID))

    async with make_async_client(app) as client:
        response = await client.post(
            _CREATE_PATH,
            json=_VALID_BODY,
            headers={"Authorization": f"Bearer {mint_access_token(user_id=uuid4())}"},
        )

    assert response.status_code == 400
    assert response.json()["details"] == {"place_ids": [str(LONDON_PLACE_ID)]}
    assert fake_journey_repository.journeys == []


async def test_create_journey_out_of_range_coordinate_returns_422(
    client: AsyncClient,
    mint_access_token: Callable[..., str],
) -> None:
    """422: форму (диапазоны координат) валидирует presentation → validation_error, а не доменный 400."""
    response = await client.post(
        _CREATE_PATH,
        json={**_VALID_BODY, "origin": {**_MOSCOW, "latitude": 200.0}},
        headers={"Authorization": f"Bearer {mint_access_token(user_id=uuid4())}"},
    )

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


async def test_get_journeys_map_returns_aggregated_countries(
    client: AsyncClient,
    fake_journey_repository: FakeJourneyRepository,
    mint_access_token: Callable[..., str],
) -> None:
    """200: агрегат карты сериализуется в camelCase — страны по коду, города с координатами и годами."""
    user_id = uuid4()
    fake_journey_repository.visited_places_by_user_id[user_id] = [
        VisitedPlace(
            place=make_geo_point(place_id=LONDON_PLACE_ID, country_code="GB", latitude=51.5, longitude=-0.12),
            years=(2020,),
        ),
        VisitedPlace(
            place=make_geo_point(place_id=MOSCOW_PLACE_ID, country_code="RU", latitude=55.75, longitude=37.62),
            years=(2020,),
        ),
    ]

    response = await client.get(_MAP_PATH, headers={"Authorization": f"Bearer {mint_access_token(user_id=user_id)}"})

    assert response.status_code == 200
    body = response.json()
    assert [country["countryCode"] for country in body["countries"]] == ["GB", "RU"]
    london = body["countries"][0]["cities"][0]
    assert london["placeId"] == str(LONDON_PLACE_ID)
    assert set(london) == {"placeId", "latitude", "longitude", "years"}
    assert london["years"] == [2020]
    assert london["latitude"] == pytest.approx(51.5)
    assert london["longitude"] == pytest.approx(-0.12)


async def test_get_journeys_map_without_token_returns_401(client: AsyncClient) -> None:
    """401: запрос карты без Bearer-токена отклоняется доменным кодом auth.invalid_access_token."""
    response = await client.get(_MAP_PATH)

    assert response.status_code == 401
    assert response.json()["code"] == "auth.invalid_access_token"


async def test_get_journeys_map_without_journeys_returns_empty(
    client: AsyncClient,
    mint_access_token: Callable[..., str],
) -> None:
    """200: у пользователя без поездок карта отдаёт пустой список стран."""
    response = await client.get(_MAP_PATH, headers={"Authorization": f"Bearer {mint_access_token(user_id=uuid4())}"})

    assert response.status_code == 200
    assert response.json() == {"countries": []}


async def test_get_journeys_globe_returns_places_without_country(
    client: AsyncClient,
    fake_journey_repository: FakeJourneyRepository,
    mint_access_token: Callable[..., str],
) -> None:
    """200: глобус получает места в camelCase — id и координаты, без страны и годов."""
    user_id = uuid4()
    fake_journey_repository.visited_places_by_user_id[user_id] = [
        VisitedPlace(
            place=make_geo_point(place_id=LONDON_PLACE_ID, country_code="GB", latitude=51.5, longitude=-0.12),
            years=(2020,),
        ),
    ]

    response = await client.get(_GLOBE_PATH, headers={"Authorization": f"Bearer {mint_access_token(user_id=user_id)}"})

    assert response.status_code == 200
    [place] = response.json()["places"]
    assert set(place) == {"placeId", "latitude", "longitude"}
    assert place["placeId"] == str(LONDON_PLACE_ID)
    assert place["latitude"] == pytest.approx(51.5)


async def test_get_journeys_globe_without_journeys_returns_empty(
    client: AsyncClient,
    mint_access_token: Callable[..., str],
) -> None:
    """200: у пользователя без поездок глобус отдаёт пустой список мест."""
    response = await client.get(_GLOBE_PATH, headers={"Authorization": f"Bearer {mint_access_token(user_id=uuid4())}"})

    assert response.status_code == 200
    assert response.json() == {"places": []}


@pytest.mark.parametrize("path", [_GLOBE_PATH, _MOVEMENTS_PATH])
async def test_get_projection_without_token_returns_401(client: AsyncClient, path: str) -> None:
    """401: глобус и карта перемещений без Bearer-токена отклоняются кодом auth.invalid_access_token."""
    response = await client.get(path)

    assert response.status_code == 401
    assert response.json()["code"] == "auth.invalid_access_token"


async def test_get_movements_map_returns_routes_and_year_bounds(
    client: AsyncClient,
    fake_journey_repository: FakeJourneyRepository,
    mint_access_token: Callable[..., str],
) -> None:
    """200: маршруты с годами и годы первой и последней поездки в camelCase — у мест id и координаты, без страны."""
    user_id = uuid4()
    fake_journey_repository.year_bounds_by_user_id[user_id] = (2018, 2022)
    fake_journey_repository.movement_connections_by_user_id[user_id] = [
        MovementConnection(
            origin=make_geo_point(place_id=MOSCOW_PLACE_ID, country_code="RU", latitude=55.75, longitude=37.62),
            destination=make_geo_point(place_id=LONDON_PLACE_ID, country_code="GB", latitude=51.5, longitude=-0.12),
            years=(2018, 2021),
        ),
    ]

    response = await client.get(
        _MOVEMENTS_PATH, headers={"Authorization": f"Bearer {mint_access_token(user_id=user_id)}"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["firstYear"] == 2018
    assert body["lastYear"] == 2022
    [connection] = body["connections"]
    assert set(connection) == {"origin", "destination", "years"}
    assert set(connection["origin"]) == {"placeId", "latitude", "longitude"}
    assert connection["origin"]["placeId"] == str(MOSCOW_PLACE_ID)
    assert connection["destination"]["placeId"] == str(LONDON_PLACE_ID)
    assert connection["years"] == [2018, 2021]


async def test_get_movements_map_passes_transport_from_query(
    client: AsyncClient,
    fake_journey_repository: FakeJourneyRepository,
    mint_access_token: Callable[..., str],
) -> None:
    """Повторяющийся transportType доходит до запроса маршрутов; без параметра — без фильтра; окна лет в запросе нет."""
    user_id = uuid4()
    fake_journey_repository.year_bounds_by_user_id[user_id] = (2018, 2022)
    headers = {"Authorization": f"Bearer {mint_access_token(user_id=user_id)}"}

    filtered = await client.get(
        _MOVEMENTS_PATH,
        # Прежний параметр окна лет игнорируется: окно применяет фронт.
        params=[("transportType", "air"), ("transportType", "water"), ("yearFrom", "2019")],
        headers=headers,
    )
    unfiltered = await client.get(_MOVEMENTS_PATH, headers=headers)

    assert filtered.status_code == 200
    assert unfiltered.status_code == 200
    assert fake_journey_repository.movement_connection_queries == [
        MovementConnectionQuery(user_id=user_id, transport_types=frozenset({TransportType.AIR, TransportType.WATER})),
        MovementConnectionQuery(user_id=user_id, transport_types=None),
    ]


async def test_get_movements_map_unknown_transport_returns_422(
    client: AsyncClient,
    mint_access_token: Callable[..., str],
) -> None:
    """422: неизвестный вид транспорта — ошибка формы запроса validation_error."""
    response = await client.get(
        _MOVEMENTS_PATH,
        params={"transportType": "rocket"},
        headers={"Authorization": f"Bearer {mint_access_token(user_id=uuid4())}"},
    )

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"
