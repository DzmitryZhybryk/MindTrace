from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.geo.application.ports import PlaceRepositoryPort
from app.geo.domain.entities import Place
from app.geo.domain.value_objects import PlaceNames
from app.geo.infra.models import GeoPlace
from app.shared.repositories.base_repository import BaseDBRepository

# Бэкслеш как ESCAPE в LIKE: метасимволы пользовательского ввода (% _ \) экранируем,
# чтобы они не работали как шаблон (юзер ищет литералы, а не wildcard'ы).
_LIKE_ESCAPE = "\\"


class PlaceRepository(BaseDBRepository[GeoPlace], PlaceRepositoryPort):
    """Read-only поиск мест по газеттиру: префиксный матч ``lower(name) LIKE 'q%'``."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session=session, model=GeoPlace)

    async def search_places_by_name(self, *, search_text: str, limit: int) -> list[Place]:
        query = self._prefix_query(search_text=search_text)
        # Места ранжируем по убыванию населения, затем стабильный tie-break по external_id.
        query = query.order_by(GeoPlace.population.desc(), GeoPlace.external_id).limit(limit)
        result = await self._session.execute(query)
        return [self._to_entity(model=model) for model in result.scalars()]

    def _prefix_query(self, *, search_text: str) -> Select[tuple[GeoPlace]]:
        """
        Префиксный матч ``lower(name) LIKE 'q%'`` по ``name_en``/``name_ru``.

        Ложится на btree ``text_pattern_ops`` по ``lower(name_*)`` — берётся
        range-scan'ом для запроса любой длины (даже 1 символ).
        """
        prefix = f"{self._escape_like(search_text).lower()}%"
        return select(GeoPlace).where(
            or_(
                func.lower(GeoPlace.name_en).like(prefix, escape=_LIKE_ESCAPE),
                func.lower(GeoPlace.name_ru).like(prefix, escape=_LIKE_ESCAPE),
            ),
        )

    @staticmethod
    def _escape_like(search_text: str) -> str:
        """Экранирует LIKE-метасимволы (``\\`` ``%`` ``_``) в пользовательском вводе."""
        return (
            search_text.replace(_LIKE_ESCAPE, _LIKE_ESCAPE * 2)
            .replace("%", f"{_LIKE_ESCAPE}%")
            .replace("_", f"{_LIKE_ESCAPE}_")
        )

    @staticmethod
    def _to_entity(*, model: GeoPlace) -> Place:
        return Place(
            place_id=model.id,
            names=PlaceNames(en=model.name_en, ru=model.name_ru),
            country_code=model.country_code,
            latitude=model.latitude,
            longitude=model.longitude,
            population=model.population,
        )
