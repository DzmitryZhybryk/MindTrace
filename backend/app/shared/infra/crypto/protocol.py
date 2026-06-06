"""Протоколы одно-направленного хеширования."""

from typing import Protocol


class SaltedHasherPort(Protocol):
    """
    Протокол для одно-направленного хеширования секретов с verify.

    Применим к любым секретам, которые требуют сопротивления brute-force и
    constant-time проверки: пароли, OTP-коды подтверждения email, recovery-токены.
    Реализация — медленный соль-устойчивый алгоритм (Argon2 / bcrypt /scrypt),
    не криптографические checksum-хеши вроде SHA-256.
    """

    def hash(self, secret: str) -> str:
        """
        Хеширует сырой секрет.

        Args:
            secret: Секрет в открытом виде

        Returns:
            Строковое представление хеша секрета
        """
        ...

    def verify(self, secret: str, hashed: str) -> bool:
        """
        Проверяет соответствие сырого секрета переданному хешу.

        Args:
            secret: Секрет в открытом виде
            hashed: Ранее полученный хеш секрета

        Returns:
            ``True``, если секрет соответствует хешу, иначе ``False``
        """
        ...


class DeterministicHasherPort(Protocol):
    """
    Протокол детерминированного хеширования: один и тот же вход → один и тот же выход.

    Контраст с ``SaltedHasherPort`` — там результат каждый раз разный из-за
    рандомной соли, что ломает поиск по индексу. Здесь же одно значение
    хеша на один plaintext, поэтому подходит для index lookup'а в БД
    (refresh-токены, opaque API-ключи, идемпотентные ключи запросов).

    Безопасность держится не на slow-hashing'е, а на высокой энтропии
    самого plaintext'а — низкоэнтропийные секреты (пароли, OTP) сюда
    не подсовывать, для них есть ``SaltedHasherPort``.

    Метод намеренно называется ``digest`` (а не ``hash``), чтобы протокол
    был структурно несовместим с ``SaltedHasherPort.hash`` — Python's structural
    typing иначе пропустил бы подмену ``Argon2SaltedHasher`` на месте
    детерминированного хешера, и index lookup ломался бы в runtime.
    """

    def digest(self, secret: str) -> str:
        """
        Детерминированно хеширует значение.

        Args:
            secret: Plaintext, предполагается high-entropy

        Returns:
            Строковое представление хеша
        """
        ...
