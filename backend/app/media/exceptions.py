from app.shared.exceptions import InternalError


class ObjectStorageError(InternalError):
    """
    Объектное хранилище не ответило или отказало в операции.

    Сам не бросается: сбой всегда классифицирован одним из наследников, а этот класс — для того,
    кому классификация не важна.
    """

    code = "media.object_storage_error"
    message = "Ошибка хранилища файлов"


class ObjectStorageTemporaryError(ObjectStorageError):
    """Сбой, который может пройти сам: сеть, таймаут, перегрузка или внутренняя ошибка хранилища."""

    code = "media.object_storage_temporary_error"


class ObjectStoragePersistentError(ObjectStorageError):
    """Сбой, который повтор не исправит: нет прав, неверные ключи или подпись, нет бакета, ошибка запроса."""

    code = "media.object_storage_persistent_error"


class ObjectNotFoundError(InternalError):
    """
    Объекта по ключу нет в бакете.

    Технический сигнал хранилища, не ответ клиенту: вызывающий use case сам решает, что значит
    пропавший объект для его потока.
    """

    code = "media.object_not_found"
    message = "Файл не найден в хранилище"


class ObjectTooLargeError(InternalError):
    """Объект в бакете больше предела, с которым его читают."""

    code = "media.object_too_large"
    message = "Файл в хранилище больше допустимого"
