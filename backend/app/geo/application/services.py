from app.geo.application.ports import CityRepositoryPort
from app.geo.application.schemas import CitySearchItem, CitySearchResult, SearchCitiesCommand
from app.geo.domain.entities import City
from app.geo.domain.enums import Language
from app.shared.logging import get_logger

logger = get_logger(__name__)


class CityService:
    """Поиск городов по газеттиру для автокомплита поездки (read-only)."""

    def __init__(self, *, repository: CityRepositoryPort) -> None:
        self._repository = repository

    async def search_cities(self, command: SearchCitiesCommand) -> CitySearchResult:
        """
        Ищет города под автокомплит по префиксу имени и резолвит их имена под язык запроса.

        Args:
            command: Запрос автокомплита (текст, язык, лимит)

        Returns:
            Упорядоченная выдача кандидатов с именами под язык запроса
        """
        # Убираем пробелы по краям, чтобы не сбить LIKE-паттерн префиксного матча.
        search_text = command.search_text.strip()
        if not search_text:
            return CitySearchResult(items=())

        cities = await self._repository.search(search_text=search_text, limit=command.limit)
        items = tuple(self._build_item(city=city, language=command.language) for city in cities)
        return CitySearchResult(items=items)

    def _build_item(self, *, city: City, language: Language) -> CitySearchItem:
        """
        Собирает кандидата выдачи и фиксирует сигнал отсутствующего перевода.

        Args:
            city: Найденный город
            language: Язык, под который резолвится отображаемое имя

        Returns:
            Кандидат автокомплита с именем, резолвнутым под язык запроса
        """
        name = city.display_name(language=language)
        if city.localized_name(language=language) is None:
            # Сигнал качества данных: город без перевода на язык запроса (отдаём фоллбэк
            # name_en). Фильтр в Grafana/Loki: event="geo.city_name_missing"; топ
            # кандидатов на ручной бэкфилл = count by geoname_id, приоритет по population.
            logger.info(
                "geo.city_name_missing",
                language=language,
                geoname_id=city.geoname_id,
                name=name,
                country_code=city.country_code,
                population=city.population,
            )

        return CitySearchItem(
            geoname_id=city.geoname_id,
            name=name,
            country_code=city.country_code,
            latitude=city.latitude,
            longitude=city.longitude,
            population=city.population,
        )
