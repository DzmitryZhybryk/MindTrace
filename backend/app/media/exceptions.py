from app.shared.exceptions import BaseDomainError, InternalError, UnavailableError


class ObjectStorageError(BaseDomainError):
    """
    Объектное хранилище не ответило или отказало в операции.

    Сам не бросается и категорию, код и сообщение не задаёт: лист берёт их из категорийной базы,
    а этот класс — для того, кому классификация не важна.
    """


class ObjectStorageTemporaryError(ObjectStorageError, UnavailableError):
    """Сбой, который может пройти сам: сеть, таймаут, перегрузка, троттлинг или внутренняя ошибка хранилища."""


class ObjectStoragePersistentError(ObjectStorageError, InternalError):
    """Сбой, который повтор не исправит: нет прав, неверные ключи или подпись, нет бакета, ошибка запроса."""

    code = "media.object_storage_persistent_error"
    message = "Ошибка хранилища файлов"


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
