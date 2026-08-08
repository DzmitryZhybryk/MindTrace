"""
api-тесты роутов journeys (``POST /v1/journeys/`` и ``GET /v1/journeys/map``) на ASGI-приложении.

Реальная проводка ``journey_service`` поверх фейк-UoW, реальный декод Bearer-токена
(``mint_access_token`` подписывает settings-секретом; ``sub`` токена становится ``user_id``
поездки). Пиннят 201-payload-on-create, 401 без токена, доменные 400-коды, 422 формы и
сериализацию агрегата карты (страны/города/годы, camelCase).
"""

import datetime as dt
from collections.abc import Callable
from typing import Any
from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.journeys.domain.enums import TransportType
from tests.builders import make_approximate_date, make_geo_point, make_journey
from tests.fakes import FakeJourneyRepository, FakeJourneyUnitOfWork

_CREATE_PATH = "/v1/journeys/"
_MAP_PATH = "/v1/journeys/map"
_MOSCOW = {"name": "Moscow", "countryCode": "RU", "latitude": 55.75, "longitude": 37.62}
_LONDON = {"name": "London", "countryCode": "GB", "latitude": 51.5, "longitude": -0.12}
_VALID_BODY: dict[str, Any] = {
    "origin": _MOSCOW,
    "destination": _LONDON,
    "transportType": "air",
    "traveledYear": 2020,
    "traveledMonth": 6,
    "traveledDay": None,
}
_FUTURE_YEAR = dt.datetime.now(tz=dt.UTC).year + 1


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
        headers={"Authorization": f"Bearer {mint_access_token(user_id)}"},
    )

    assert response.status_code == 201
    assert response.content == b""
    assert len(fake_journey_repository.journeys) == 1
    journey_entity = fake_journey_repository.journeys[0]
    assert journey_entity.user_id == user_id
    assert journey_entity.origin.name == "Moscow"
    assert journey_entity.destination.name == "London"
    assert journey_entity.transport_type is TransportType.AIR
    fake_journey_uow.commit_mock.assert_awaited_once()


async def test_create_journey_without_token_returns_401(client: AsyncClient) -> None:
    """401: запрос без Bearer-токена отклоняется с доменным кодом auth.invalid_access_token."""
    response = await client.post(_CREATE_PATH, json=_VALID_BODY)

    assert response.status_code == 401
    assert response.json()["code"] == "auth.invalid_access_token"


@pytest.mark.parametrize(
    ("overrides", "expected_code", "expected_field"),
    [
        ({"destination": _MOSCOW}, "journeys.same_origin_destination", None),
        ({"traveledYear": _FUTURE_YEAR}, "journeys.date_in_future", "year"),
        ({"traveledMonth": None, "traveledDay": 15}, "journeys.invalid_date", "year"),
    ],
)
async def test_create_journey_domain_errors_return_400(
    client: AsyncClient,
    fake_journey_repository: FakeJourneyRepository,
    mint_access_token: Callable[..., str],
    overrides: dict[str, Any],
    expected_code: str,
    expected_field: str | None,
) -> None:
    """400: инвариант origin≠destination и валидация даты живут в домене → доменные journeys.*-коды, не 422.

    Date-ошибки несут ``details.field='year'`` — это имя поля ФОРМЫ (фронтовый routing-хинт),
    а не имя wire-поля ``traveled_year``; контракт пиннится, чтобы фронт-роутинг не отвалился.
    """
    response = await client.post(
        _CREATE_PATH,
        json={**_VALID_BODY, **overrides},
        headers={"Authorization": f"Bearer {mint_access_token(uuid4())}"},
    )

    body = response.json()
    assert response.status_code == 400
    assert body["code"] == expected_code
    assert (body.get("details") or {}).get("field") == expected_field
    assert fake_journey_repository.journeys == []


async def test_create_journey_out_of_range_coordinate_returns_422(
    client: AsyncClient,
    mint_access_token: Callable[..., str],
) -> None:
    """422: форму (диапазоны координат) валидирует presentation → validation_error, а не доменный 400."""
    response = await client.post(
        _CREATE_PATH,
        json={**_VALID_BODY, "origin": {**_MOSCOW, "latitude": 200.0}},
        headers={"Authorization": f"Bearer {mint_access_token(uuid4())}"},
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
    fake_journey_repository.journeys.append(
        make_journey(
            user_id=user_id,
            origin=make_geo_point(name="Moscow", country_code="RU", latitude=55.75, longitude=37.62),
            destination=make_geo_point(name="London", country_code="GB", latitude=51.5, longitude=-0.12),
            traveled_on=make_approximate_date(year=2020),
        )
    )

    response = await client.get(_MAP_PATH, headers={"Authorization": f"Bearer {mint_access_token(user_id)}"})

    assert response.status_code == 200
    body = response.json()
    assert [country["countryCode"] for country in body["countries"]] == ["GB", "RU"]
    london = body["countries"][0]["cities"][0]
    assert london["name"] == "London"
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
    response = await client.get(_MAP_PATH, headers={"Authorization": f"Bearer {mint_access_token(uuid4())}"})

    assert response.status_code == 200
    assert response.json() == {"countries": []}
