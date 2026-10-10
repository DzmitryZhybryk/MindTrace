from collections.abc import Collection, Sequence
from uuid import UUID

from sqlalchemy import ColumnElement, Subquery, func, or_, select, union_all, update
from sqlalchemy.dialects.postgresql import aggregate_order_by, distinct_on
from sqlalchemy.ext.asyncio import AsyncSession

from app.journeys.application.ports.journey_repository import (
    JourneyFilters,
    JourneyOrderScope,
    JourneyRepositoryPort,
    MovementConnection,
    VisitedPlace,
)
from app.journeys.domain.entities import JourneyEntity
from app.journeys.domain.enums import TransportType
from app.journeys.domain.value_objects import GeoPoint
from app.journeys.infra.models import Journey
from app.shared.fractional_index import BaseSortKeyRepository
from app.shared.pagination import CursorPage, PageQuery, decode_cursor, split_page
from app.shared.types import DictStrAny


class JourneyRepository(BaseSortKeyRepository[Journey, JourneyOrderScope], JourneyRepositoryPort):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session=session, model=Journey)

    async def insert_journey(self, journey_entity: JourneyEntity) -> None:
        await self.insert(data=Journey(**self._to_columns(journey_entity=journey_entity)))

    async def update_journey_by_id(self, journey_entity: JourneyEntity) -> None:
        """
        Записывает изменённое состояние поездки одним UPDATE по PK.

        Все колонки, кроме PK, переписываются текущим состоянием сущности.

        Args:
            journey_entity: Поездка с уже изменённым состоянием
        """
        values = self._to_columns(journey_entity=journey_entity)
        del values["id"]  # PK не входит в SET
        query = update(Journey).where(Journey.id == journey_entity.journey_id).values(**values)
        await self._session.execute(query)

    async def find_journey_by_id_and_user_id_for_update(
        self,
        *,
        journey_id: UUID,
        user_id: UUID,
    ) -> JourneyEntity | None:
        """
        Находит поездку пользователя по id и блокирует строку до конца транзакции.

        Удалённая поездка находится: интерпретировать удаление — дело вызывающего.

        Args:
            journey_id: Id поездки
            user_id: Владелец поездки

        Returns:
            Поездка; ``None``, если у пользователя такой нет
        """
        query = select(Journey).where(Journey.id == journey_id, Journey.user_id == user_id).with_for_update()
        journey_model = await self._fetch_one(query=query)
        return self._to_entity(journey_model=journey_model) if journey_model else None

    async def find_journey_by_id_and_user_id(self, *, journey_id: UUID, user_id: UUID) -> JourneyEntity | None:
        """
        Находит поездку пользователя по id, без блокировки.

        Удалённая поездка находится: интерпретировать удаление — дело вызывающего.

        Args:
            journey_id: Id поездки
            user_id: Владелец поездки

        Returns:
            Поездка; ``None``, если у пользователя такой нет
        """
        query = select(Journey).where(Journey.id == journey_id, Journey.user_id == user_id)
        journey_model = await self._fetch_one(query=query)
        return self._to_entity(journey_model=journey_model) if journey_model else None

    def _sort_key_scope(self, scope: JourneyOrderScope) -> Sequence[ColumnElement[bool]]:
        return (
            Journey.user_id == scope.user_id,
            Journey.traveled_year == scope.traveled_year,
            Journey.deleted_at.is_(None),
        )

    async def find_visited_places_by_user_id(self, *, user_id: UUID) -> tuple[VisitedPlace, ...]:
        """
        Возвращает места, где пользователь побывал, — по одному на место.

        Soft-deleted поездки не учитываются. Годы — всех поездок с местом, по возрастанию.
        Порядок — по коду страны, затем по ``place_id``.

        Args:
            user_id: Владелец поездок

        Returns:
            Посещённые места (пустой список, если поездок нет)
        """
        visits = self._place_visits(user_id=user_id)
        visit_year = visits.c.traveled_year
        # Поездки копируют страну и координаты места из справочника, копии одного места могут
        # слегка разойтись после его обновления — берём одну копию целиком, первую попавшуюся.
        place_copies = (
            select(visits.c.place_id, visits.c.country_code, visits.c.latitude, visits.c.longitude)
            .ext(distinct_on(visits.c.place_id))
            .order_by(visits.c.place_id, visits.c.latitude, visits.c.longitude)
            .subquery("place_copies")
        )
        place_years = (
            select(
                visits.c.place_id,
                func.array_agg(aggregate_order_by(visit_year.distinct(), visit_year)).label("years"),
            )
            .group_by(visits.c.place_id)
            .subquery("place_years")
        )
        query = (
            select(
                place_copies.c.place_id,
                place_copies.c.country_code,
                place_copies.c.latitude,
                place_copies.c.longitude,
                place_years.c.years,
            )
            .join(place_years, place_years.c.place_id == place_copies.c.place_id)
            .order_by(place_copies.c.country_code, place_copies.c.place_id)
        )
        result = await self._session.execute(query)
        return tuple(
            VisitedPlace(
                place=GeoPoint(
                    place_id=row.place_id,
                    country_code=row.country_code,
                    latitude=row.latitude,
                    longitude=row.longitude,
                ),
                years=tuple(row.years),
            )
            for row in result
        )

    async def find_movement_connections_by_user_id(
        self,
        *,
        user_id: UUID,
        transport_types: Collection[TransportType] | None,
    ) -> tuple[MovementConnection, ...]:
        """
        Возвращает маршруты поездок пользователя — по одному на пару «откуда → куда».

        Учитываются неудалённые поездки на указанных видах транспорта (``None`` — на всех).
        У маршрута — годы его поездок, по возрастанию. Страна, широта и долгота места берутся
        независимо (``min``), поэтому при разошедшихся копиях точка может не совпасть ни с одной из них.
        Порядок — по ``place_id`` отправления, затем назначения.

        Args:
            user_id: Владелец поездок
            transport_types: Виды транспорта, поездки на которых учитываются

        Returns:
            Маршруты с координатами и годами поездок (пустой список, если поездок нет)
        """
        traveled_year = Journey.traveled_year
        filters = [Journey.user_id == user_id, Journey.deleted_at.is_(None)]
        if transport_types is not None:
            filters.append(Journey.transport_type.in_(transport_types))

        query = (
            select(
                Journey.origin_place_id,
                func.min(Journey.origin_country_code).label("origin_country_code"),
                func.min(Journey.origin_latitude).label("origin_latitude"),
                func.min(Journey.origin_longitude).label("origin_longitude"),
                Journey.destination_place_id,
                func.min(Journey.destination_country_code).label("destination_country_code"),
                func.min(Journey.destination_latitude).label("destination_latitude"),
                func.min(Journey.destination_longitude).label("destination_longitude"),
                func.array_agg(aggregate_order_by(traveled_year.distinct(), traveled_year)).label("years"),
            )
            .where(*filters)
            .group_by(Journey.origin_place_id, Journey.destination_place_id)
            .order_by(Journey.origin_place_id, Journey.destination_place_id)
        )
        result = await self._session.execute(query)
        return tuple(
            MovementConnection(
                origin=GeoPoint(
                    place_id=row.origin_place_id,
                    country_code=row.origin_country_code,
                    latitude=row.origin_latitude,
                    longitude=row.origin_longitude,
                ),
                destination=GeoPoint(
                    place_id=row.destination_place_id,
                    country_code=row.destination_country_code,
                    latitude=row.destination_latitude,
                    longitude=row.destination_longitude,
                ),
                years=tuple(row.years),
            )
            for row in result
        )

    async def find_journeys_page_by_user_id(
        self,
        *,
        user_id: UUID,
        page: PageQuery,
        filters: JourneyFilters,
    ) -> CursorPage[JourneyEntity]:
        """
        Возвращает страницу ленты неудалённых поездок пользователя под фильтром.

        Порядок — свежий год сверху, внутри года — по ``sort_key``. Курсор — год и ключ последней
        строки страницы; ``(год, ключ)`` уникален среди неудалённых поездок, другого тай-брейкера не нужно.

        Args:
            user_id: Владелец поездок
            page: Курсор и размер страницы
            filters: Годы и виды транспорта

        Returns:
            Поездки страницы и курсор следующей

        Raises:
            InvalidCursorError: курсор не разбирается или выдан другим списком
        """
        conditions = [Journey.user_id == user_id, Journey.deleted_at.is_(None)]
        if filters.year_from is not None:
            conditions.append(Journey.traveled_year >= filters.year_from)

        if filters.year_to is not None:
            conditions.append(Journey.traveled_year <= filters.year_to)

        if filters.transport_types is not None:
            conditions.append(Journey.transport_type.in_(filters.transport_types))

        if page.cursor is not None:
            cursor_year, cursor_sort_key = decode_cursor(cursor=page.cursor, parsers=(int, str))
            # Граница по году отдельным условием: по ней индекс начинает сразу с нужного года,
            # а одно OR планировщик может применить фильтром ко всем поездкам пользователя.
            conditions.append(Journey.traveled_year <= cursor_year)
            conditions.append(or_(Journey.traveled_year < cursor_year, Journey.sort_key > cursor_sort_key))

        query = (
            select(Journey)
            .where(*conditions)
            .order_by(Journey.traveled_year.desc(), Journey.sort_key)
            .limit(page.limit + 1)
        )
        result = await self._session.scalars(query)
        page_models, next_cursor = split_page(
            rows=result.all(),
            limit=page.limit,
            cursor_values=lambda journey_model: (str(journey_model.traveled_year), journey_model.sort_key),
        )
        journey_entities = tuple(self._to_entity(journey_model=journey_model) for journey_model in page_models)
        return CursorPage(items=journey_entities, next_cursor=next_cursor)

    async def find_journey_years_by_user_id(self, user_id: UUID) -> tuple[int, ...]:
        """
        Возвращает годы неудалённых поездок пользователя, по возрастанию, без повторов.

        Args:
            user_id: Владелец поездок

        Returns:
            Годы поездок; пусто, если поездок нет
        """
        query = (
            select(Journey.traveled_year)
            .where(Journey.user_id == user_id, Journey.deleted_at.is_(None))
            .distinct()
            .order_by(Journey.traveled_year)
        )
        result = await self._session.scalars(query)
        return tuple(result)

    @staticmethod
    def _place_visits(*, user_id: UUID) -> Subquery:
        """Визиты мест: каждая неудалённая поездка пользователя даёт два — отправление и назначение."""
        is_user_journey = (Journey.user_id == user_id, Journey.deleted_at.is_(None))
        origins = select(
            Journey.origin_place_id.label("place_id"),
            Journey.origin_country_code.label("country_code"),
            Journey.origin_latitude.label("latitude"),
            Journey.origin_longitude.label("longitude"),
            Journey.traveled_year,
        ).where(*is_user_journey)
        destinations = select(
            Journey.destination_place_id,
            Journey.destination_country_code,
            Journey.destination_latitude,
            Journey.destination_longitude,
            Journey.traveled_year,
        ).where(*is_user_journey)
        return union_all(origins, destinations).subquery("visits")

    def _to_entity(self, journey_model: Journey) -> JourneyEntity:
        """
        Конвертирует ORM-модель в доменную сущность.

        Args:
            journey_model: ORM-модель из БД

        Returns:
            Доменная сущность поездки
        """
        return JourneyEntity(
            journey_id=journey_model.id,
            user_id=journey_model.user_id,
            origin=GeoPoint(
                place_id=journey_model.origin_place_id,
                country_code=journey_model.origin_country_code,
                latitude=journey_model.origin_latitude,
                longitude=journey_model.origin_longitude,
            ),
            destination=GeoPoint(
                place_id=journey_model.destination_place_id,
                country_code=journey_model.destination_country_code,
                latitude=journey_model.destination_latitude,
                longitude=journey_model.destination_longitude,
            ),
            transport_type=TransportType(journey_model.transport_type),
            distance_km=journey_model.distance_km,
            traveled_year=journey_model.traveled_year,
            sort_key=journey_model.sort_key,
            created_at=journey_model.created_at,
            updated_at=journey_model.updated_at,
            deleted_at=journey_model.deleted_at,
        )

    def _to_columns(self, journey_entity: JourneyEntity) -> DictStrAny:
        """
        Единый маппинг поездки в колонки ORM-модели (включая PK ``id``).

        Источник истины для обоих путей записи: INSERT (``Journey(**columns)``) и UPDATE (те же
        колонки минус PK) — новое поле добавляется здесь один раз и попадает в оба.

        Args:
            journey_entity: Доменная сущность поездки

        Returns:
            Словарь ``column -> value`` со всеми колонками, включая PK
        """
        return {
            "id": journey_entity.journey_id,
            "user_id": journey_entity.user_id,
            "origin_place_id": journey_entity.origin.place_id,
            "origin_country_code": journey_entity.origin.country_code,
            "origin_latitude": journey_entity.origin.latitude,
            "origin_longitude": journey_entity.origin.longitude,
            "destination_place_id": journey_entity.destination.place_id,
            "destination_country_code": journey_entity.destination.country_code,
            "destination_latitude": journey_entity.destination.latitude,
            "destination_longitude": journey_entity.destination.longitude,
            "transport_type": journey_entity.transport_type,
            "distance_km": journey_entity.distance_km,
            "traveled_year": journey_entity.traveled_year,
            "sort_key": journey_entity.sort_key,
            "created_at": journey_entity.created_at,
            "updated_at": journey_entity.updated_at,
            "deleted_at": journey_entity.deleted_at,
        }
