from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.geo.application.ports import CityRepositoryPort
from app.geo.domain.entities import City
from app.geo.domain.value_objects import CityNames
from app.geo.infra.models import GeonamesCity
from app.shared.repositories.base_repository import BaseDBRepository

# Бэкслеш как ESCAPE в LIKE: метасимволы пользовательского ввода (% _ \) экранируем,
# чтобы они не работали как шаблон (юзер ищет литералы, а не wildcard'ы).
_LIKE_ESCAPE = "\\"


class CityRepository(BaseDBRepository[GeonamesCity], CityRepositoryPort):
    """Read-only поиск городов по газеттиру: префиксный матч ``lower(name) LIKE 'q%'``."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session=session, model=GeonamesCity)

    async def search(self, *, search_text: str, limit: int) -> list[City]:
        query = self._prefix_query(search_text=search_text)
        # Города ранжируем по убыванию населения, затем стабильный tie-break по id.
        query = query.order_by(GeonamesCity.population.desc(), GeonamesCity.geoname_id).limit(limit)
        result = await self._session.execute(query)
        return [self._to_entity(model=model) for model in result.scalars()]

    def _prefix_query(self, *, search_text: str) -> Select[tuple[GeonamesCity]]:
        """
        Префиксный матч ``lower(name) LIKE 'q%'`` по ``name_en``/``name_ru``.

        Ложится на btree ``text_pattern_ops`` по ``lower(name_*)`` — берётся
        range-scan'ом для запроса любой длины (даже 1 символ).
        """
        prefix = f"{self._escape_like(search_text).lower()}%"
        return select(GeonamesCity).where(
            or_(
                func.lower(GeonamesCity.name_en).like(prefix, escape=_LIKE_ESCAPE),
                func.lower(GeonamesCity.name_ru).like(prefix, escape=_LIKE_ESCAPE),
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
    def _to_entity(*, model: GeonamesCity) -> City:
        return City(
            geoname_id=model.geoname_id,
            names=CityNames(en=model.name_en, ru=model.name_ru),
            country_code=model.country_code,
            latitude=model.latitude,
            longitude=model.longitude,
            population=model.population,
        )
