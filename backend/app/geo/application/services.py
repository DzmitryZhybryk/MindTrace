from app.geo.application.ports import PlaceRepositoryPort
from app.geo.application.schemas import PlaceSearchItem, PlaceSearchResult, SearchPlacesCommand
from app.geo.domain.entities import Place
from app.geo.domain.enums import Language
from app.shared.logging import get_logger

logger = get_logger(__name__)


class PlaceService:
    """Поиск мест по газеттиру для автокомплита поездки (read-only)."""

    def __init__(self, *, repository: PlaceRepositoryPort) -> None:
        self._repository = repository

    async def search_places(self, command: SearchPlacesCommand) -> PlaceSearchResult:
        """
        Ищет места под автокомплит по префиксу имени и резолвит их имена под язык запроса.

        Args:
            command: Запрос автокомплита (текст, язык, лимит)

        Returns:
            Упорядоченная выдача кандидатов с именами под язык запроса
        """
        # Убираем пробелы по краям, чтобы не сбить LIKE-паттерн префиксного матча.
        search_text = command.search_text.strip()
        if not search_text:
            return PlaceSearchResult(items=())

        places = await self._repository.search_places_by_name(search_text=search_text, limit=command.limit)
        items = tuple(self._build_item(place=place, language=command.language) for place in places)
        return PlaceSearchResult(items=items)

    def _build_item(self, *, place: Place, language: Language) -> PlaceSearchItem:
        """
        Собирает кандидата выдачи и фиксирует сигнал отсутствующего перевода.

        Args:
            place: Найденное место
            language: Язык, под который резолвится отображаемое имя

        Returns:
            Кандидат автокомплита с именем, резолвнутым под язык запроса
        """
        name = place.display_name(language=language)
        if place.localized_name(language=language) is None:
            # Сигнал качества данных: место без перевода на язык запроса (отдаём фоллбэк
            # name_en). Фильтр в Grafana/Loki: event="geo.place_name_missing"; топ
            # кандидатов на ручной бэкфилл = count by place_id, приоритет по population.
            logger.info(
                "geo.place_name_missing",
                language=language,
                place_id=place.place_id,
                name=name,
                country_code=place.country_code,
                population=place.population,
            )

        return PlaceSearchItem(
            place_id=place.place_id,
            name=name,
            country_code=place.country_code,
            latitude=place.latitude,
            longitude=place.longitude,
            population=place.population,
        )
