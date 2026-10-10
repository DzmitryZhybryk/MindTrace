from typing import Final
from uuid import NAMESPACE_URL, UUID, uuid5

# Строку не менять: у всех мест сменятся id, а их уже хранят те, кто на места ссылается.
GEO_PLACE_NAMESPACE: Final[UUID] = uuid5(NAMESPACE_URL, "urn:mindtrace:geo-place")


def place_id_for(*, external_id: str) -> UUID:
    """
    Выводит id места из ключа поставщика (uuid5): одинаковый на любом окружении.

    Args:
        external_id: Ключ места с префиксом источника (``"GeoNames:524901"``)

    Returns:
        Наш id места
    """
    return uuid5(GEO_PLACE_NAMESPACE, external_id)
