from app.geo.application.ports import PlaceRepositoryPort
from app.geo.application.schemas import PlaceSearchItem, PlaceSearchResult, SearchPlacesCommand
from app.geo.domain.entities import PlaceEntity
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
        items = tuple(self._build_item(place_entity=place_entity, language=command.language) for place_entity in places)
        return PlaceSearchResult(items=items)

    def _build_item(self, *, place_entity: PlaceEntity, language: Language) -> PlaceSearchItem:
        """
        Собирает кандидата выдачи и фиксирует сигнал отсутствующего перевода.

        Args:
            place_entity: Найденное место
            language: Язык, под который резолвится отображаемое имя

        Returns:
            Кандидат автокомплита с именем, резолвнутым под язык запроса
        """
        name = place_entity.display_name(language=language)
        if place_entity.localized_name(language=language) is None:
            # Сигнал качества данных: место без перевода на язык запроса (отдаём фоллбэк
            # name_en). Фильтр в Grafana/Loki: event="geo.place_name_missing"; топ
            # кандидатов на ручной бэкфилл = count by place_id, приоритет по population.
            logger.info(
                "geo.place_name_missing",
                language=language,
                place_id=place_entity.place_id,
                name=name,
                country_code=place_entity.country_code,
                population=place_entity.population,
            )

        return PlaceSearchItem(
            place_id=place_entity.place_id,
            name=name,
            country_code=place_entity.country_code,
            latitude=place_entity.latitude,
            longitude=place_entity.longitude,
            population=place_entity.population,
        )
