"""Интерфейс и реализация хеширования верифицируемых секретов."""

from typing import Protocol

from argon2 import PasswordHasher as Argon2Hasher
from argon2.exceptions import VerifyMismatchError


class SecretHasher(Protocol):
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


class Argon2SecretHasher:
    """
    Реализация ``SecretHasher`` через Argon2.

    Argon2 — победитель Password Hashing Competition (PHC), рекомендован
    OWASP для хеширования паролей и других чувствительных секретов.
    """

    def __init__(self) -> None:
        self._hasher = Argon2Hasher()

    def hash(self, secret: str) -> str:
        """
        Хеширует секрет используя Argon2.

        Args:
            secret: Секрет в открытом виде

        Returns:
            Хешированный секрет в формате Argon2
        """
        return self._hasher.hash(secret)

    def verify(self, secret: str, hashed: str) -> bool:
        """
        Проверяет соответствие секрета хешу.

        Args:
            secret: Секрет в открытом виде
            hashed: Хешированный секрет

        Returns:
            ``True`` если секрет соответствует хешу. Иначе ``False``.
        """
        try:
            self._hasher.verify(hashed, secret)
        except VerifyMismatchError:
            return False
        else:
            return True
