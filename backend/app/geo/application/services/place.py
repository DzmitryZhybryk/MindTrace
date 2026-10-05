from app.geo.application.ports.place_repository import PlaceRepositoryPort
from app.geo.application.schemas.commands import GetMissingPlaceIdsCommand, ResolvePlacesCommand, SearchPlacesCommand
from app.geo.application.schemas.results import (
    MissingPlaceIdsResult,
    PlaceSearchItem,
    PlaceSearchResult,
    ResolvedPlace,
    ResolvePlacesResult,
)
from app.shared.logging import get_logger

logger = get_logger(__name__)


class PlaceService:
    """Поиск мест в газеттире и их названия на нужном языке."""

    def __init__(self, *, repository: PlaceRepositoryPort, logged_unknown_place_ids_limit: int = 10) -> None:
        """
        Args:
            repository: Репозиторий мест
            logged_unknown_place_ids_limit: Сколько неизвестных id попадает в лог — для сигнала хватает
                примера, а весь запрос — до 1000 id
        """
        self._repository = repository
        self._logged_unknown_place_ids_limit = logged_unknown_place_ids_limit

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
        items: list[PlaceSearchItem] = []
        for place_entity in places:
            name = place_entity.display_name(language=command.language)
            if place_entity.localized_name(language=command.language) is None:
                # Сигнал качества данных: место без перевода на язык запроса (отдаём фоллбэк
                # name_en). Фильтр в Grafana/Loki: event="geo.place_name_missing"; топ
                # кандидатов на ручной бэкфилл = count by place_id, приоритет по population.
                logger.info(
                    "geo.place_name_missing",
                    language=command.language,
                    place_id=place_entity.place_id,
                    name=name,
                    country_code=place_entity.country_code,
                    population=place_entity.population,
                )

            items.append(
                PlaceSearchItem(
                    place_id=place_entity.place_id,
                    name=name,
                    country_code=place_entity.country_code,
                    latitude=place_entity.latitude,
                    longitude=place_entity.longitude,
                    population=place_entity.population,
                )
            )

        return PlaceSearchResult(items=tuple(items))

    async def resolve_places(self, command: ResolvePlacesCommand) -> ResolvePlacesResult:
        """
        Возвращает названия мест по их id на языке запроса.

        Нужен тем, кто хранит у себя только id мест, а названия показывает на языке
        пользователя. Если перевода на этот язык нет, отдаётся английское название.

        Id, которых нет в газеттире, в ответ не попадают и пишутся в лог предупреждением:
        газеттир места не удаляет, так что неизвестный id — это сбой, а не норма.

        Args:
            command: Id мест и язык

        Returns:
            Названия найденных мест
        """
        places = await self._repository.find_places_by_ids(place_ids=command.place_ids)
        missing_place_ids = set(command.place_ids) - {place_entity.place_id for place_entity in places}
        if missing_place_ids:
            logger.warning(
                "geo.place_ids_unknown",
                count=len(missing_place_ids),
                place_ids=sorted(missing_place_ids)[: self._logged_unknown_place_ids_limit],
            )

        items = tuple(
            ResolvedPlace(place_id=place_entity.place_id, name=place_entity.display_name(language=command.language))
            for place_entity in places
        )
        return ResolvePlacesResult(items=items)

    async def get_missing_place_ids(self, command: GetMissingPlaceIdsCommand) -> MissingPlaceIdsResult:
        """
        Возвращает те id из переданных, которых нет в газеттире.

        Нужен тем, кто принимает id мест извне и перед сохранением проверяет, что такие места
        есть — иначе потом их названия не найдутся.

        Args:
            command: Id мест для проверки

        Returns:
            Id ненайденных мест; пусто, если все на месте
        """
        places = await self._repository.find_places_by_ids(place_ids=command.place_ids)
        return MissingPlaceIdsResult(
            place_ids=command.place_ids - {place_entity.place_id for place_entity in places},
        )
