import re
import time
from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Final

import httpx

from app.shared.types import DictStrAny

WIKIDATA_SPARQL_URL: Final[str] = "https://query.wikidata.org/sparql"

# Политика Wikidata Query Service требует User-Agent с контактом владельца клиента.
USER_AGENT: Final[str] = "MindTrace-gazetteer/1.0 (https://github.com/DzmitryZhybryk/MindTrace)"

_GEONAMES_PREFIX: Final[str] = "GeoNames:"

# Столько id уходит в один SPARQL-запрос: длиннее — сервис начинает отвечать таймаутами.
_BATCH_SIZE: Final[int] = 400

# Сервис под нагрузкой отвечает этими кодами; запрос стоит повторить, а не ронять всю сборку.
_TRANSIENT_STATUSES: Final[frozenset[int]] = frozenset({429, 502, 503, 504})
_RETRY_DELAYS_SECONDS: Final[tuple[float, ...]] = (5.0, 15.0, 45.0)

# P1566 — свойство Wikidata «идентификатор GeoNames».
_QUERY_TEMPLATE: Final[str] = (
    "SELECT ?gn ?label WHERE {{ VALUES ?gn {{ {ids} }} ?item wdt:P1566 ?gn . "
    '?item rdfs:label ?label FILTER(lang(?label) = "ru") }}'
)

# Уточнение в конце метки: «Орай (город)», «Мушин (Нигерия)».
_TRAILING_QUALIFIER: Final[re.Pattern[str]] = re.compile(r"\s*\([^()]*\)$")

_CYRILLIC: Final[re.Pattern[str]] = re.compile(r"[А-Яа-яЁё]")


@dataclass(frozen=True, slots=True)
class EnrichmentReport:
    """Итог обогащения: сколько мест искали в Wikidata и чем кончился поиск."""

    candidates: int
    filled: int
    not_found: int
    ambiguous: int
    rejected: int


def geonames_id_of(*, external_id: str) -> str | None:
    """
    Достаёт id GeoNames из ключа места.

    Args:
        external_id: Ключ места с префиксом источника (``GeoNames:524901``)

    Returns:
        Id GeoNames или ``None``, если место не из GeoNames
    """
    if not external_id.startswith(_GEONAMES_PREFIX):
        return None

    return external_id.removeprefix(_GEONAMES_PREFIX)


def candidate_geonames_id(*, row: Mapping[str, str], min_population: int) -> str | None:
    """
    Решает, искать ли месту русское имя: имени нет, место из GeoNames и не меньше порога.

    Args:
        row: Строка файла датасета
        min_population: Нижняя граница населения

    Returns:
        Id GeoNames, по которому искать имя, или ``None``, если искать не нужно
    """
    population = row["population"]
    if row["name_ru"] or not population or int(population) < min_population:
        return None

    return geonames_id_of(external_id=row["external_id"])


def acceptable_ru_names(*, labels: Iterable[str]) -> frozenset[str]:
    """
    Отбирает из меток Wikidata те, что годятся в русское имя места.

    Уточнение в скобках в конце срезается. Отбрасываются метки без кириллицы (латиница, оставленная
    в поле ``ru``) и с запятой (имя с регионом: «Айвенго, штат Виктория, Австралия»).

    Args:
        labels: Метки ``ru`` всех объектов Wikidata с одним id GeoNames

    Returns:
        Годные имена; больше одного — id привязан к разным объектам
    """
    names = (_TRAILING_QUALIFIER.sub("", label) for label in labels)
    return frozenset(name for name in names if _CYRILLIC.search(name) and "," not in name)


def fetch_ru_labels(
    *,
    geonames_ids: Iterable[str],
    http_client: httpx.Client,
    retry_delays: Sequence[float] = _RETRY_DELAYS_SECONDS,
) -> dict[str, frozenset[str]]:
    """
    Запрашивает у Wikidata метки ``ru`` объектов по их id GeoNames.

    Args:
        geonames_ids: Id GeoNames
        http_client: HTTP-клиент
        retry_delays: Паузы перед повторами запроса, который сервис отклонил временно

    Returns:
        Метки по id GeoNames; id без единой метки в результат не попадают

    Raises:
        httpx.HTTPError: запрос к Wikidata не удался, в том числе после всех повторов
    """
    ids = list(geonames_ids)
    labels: defaultdict[str, set[str]] = defaultdict(set)
    for start in range(0, len(ids), _BATCH_SIZE):
        batch = ids[start : start + _BATCH_SIZE]
        query = _QUERY_TEMPLATE.format(ids=" ".join(f'"{geonames_id}"' for geonames_id in batch))
        response = _post_query(http_client=http_client, query=query, retry_delays=retry_delays)
        bindings: list[DictStrAny] = response.json()["results"]["bindings"]
        for binding in bindings:
            labels[binding["gn"]["value"]].add(binding["label"]["value"])

    return {geonames_id: frozenset(values) for geonames_id, values in labels.items()}


def _post_query(*, http_client: httpx.Client, query: str, retry_delays: Sequence[float]) -> httpx.Response:
    """Отправляет SPARQL-запрос, повторяя его после пауз, пока сервис отвечает временной ошибкой."""
    for delay in retry_delays:
        response = _send_query(http_client=http_client, query=query)
        if response.status_code not in _TRANSIENT_STATUSES:
            return response.raise_for_status()

        time.sleep(delay)

    return _send_query(http_client=http_client, query=query).raise_for_status()


def _send_query(*, http_client: httpx.Client, query: str) -> httpx.Response:
    return http_client.post(
        WIKIDATA_SPARQL_URL,
        data={"query": query, "format": "json"},
        headers={"User-Agent": USER_AGENT, "Accept": "application/sparql-results+json"},
    )


def enrich_rows(
    *,
    rows: Iterable[Mapping[str, str]],
    labels: Mapping[str, frozenset[str]],
    min_population: int,
) -> tuple[list[dict[str, str]], EnrichmentReport]:
    """
    Дописывает русские имена местам без них; уже заполненные имена не меняются.

    Args:
        rows: Строки файла датасета
        labels: Метки Wikidata по id GeoNames (см. ``fetch_ru_labels``)
        min_population: Нижняя граница населения для поиска имени

    Returns:
        Строки в исходном порядке и итог обогащения
    """
    enriched: list[dict[str, str]] = []
    candidates = filled = not_found = ambiguous = rejected = 0
    for row in rows:
        new_row = dict(row)
        geonames_id = candidate_geonames_id(row=row, min_population=min_population)
        if geonames_id is not None:
            candidates += 1
            found = labels.get(geonames_id, frozenset())
            names = acceptable_ru_names(labels=found)
            if len(names) == 1:
                [new_row["name_ru"]] = names
                filled += 1
            elif len(names) > 1:
                ambiguous += 1
            elif found:
                rejected += 1
            else:
                not_found += 1

        enriched.append(new_row)

    report = EnrichmentReport(
        candidates=candidates,
        filled=filled,
        not_found=not_found,
        ambiguous=ambiguous,
        rejected=rejected,
    )
    return enriched, report
