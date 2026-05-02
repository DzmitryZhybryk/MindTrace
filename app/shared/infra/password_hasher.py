"""Интерфейс и реализация хеширования паролей."""

from typing import Protocol

from argon2 import PasswordHasher as Argon2Hasher
from argon2.exceptions import VerifyMismatchError


class PasswordHasher(Protocol):
    """Протокол для хеширования и верификации паролей."""

    def hash(self, password: str) -> str:
        """
        Хеширует сырой пароль.

        Args:
            password: Пароль в открытом виде

        Returns:
            Строковое представление хеша пароля
        """
        ...

    def verify(self, password: str, hashed: str) -> bool:
        """
        Проверяет соответствие сырого пароля переданному хешу.

        Args:
            password: Пароль в открытом виде
            hashed: Ранее полученный хеш пароля

        Returns:
            ``True``, если пароль соответствует хешу, иначе ``False``
        """
        ...


class Argon2PasswordHasher:
    """
    Реализация PasswordHasher через Argon2.

    Argon2 - победитель Password Hashing Competition (PHC),
    рекомендован для использования в современных приложениях.
    """

    def __init__(self) -> None:
        self._hasher = Argon2Hasher()

    def hash(self, password: str) -> str:
        """
        Хеширует пароль используя Argon2.

        Args:
            password: Пароль в открытом виде

        Returns:
            Хешированный пароль в формате Argon2
        """
        return self._hasher.hash(password)

    def verify(self, password: str, hashed: str) -> bool:
        """
        Проверяет соответствие пароля хешу.

        Args:
            password: Пароль в открытом виде
            hashed: Хешированный пароль

        Returns:
            ``True`` если пароль соответствует хешу. Иначе ``False``.
        """
        try:
            self._hasher.verify(hashed, password)
        except VerifyMismatchError:
            return False
        else:
            return True
