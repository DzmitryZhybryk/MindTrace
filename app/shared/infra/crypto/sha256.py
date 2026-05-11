"""Реализация ``DeterministicHasher`` через SHA-256."""

import hashlib


class Sha256DeterministicHasher:
    """
    Реализация ``DeterministicHasher`` через SHA-256.

    Возвращает hex-представление SHA-256 от UTF-8 байт plaintext'а:
    один и тот же вход всегда даёт один и тот же 64-символьный hex,
    что и нужно для index lookup'а в БД.
    """

    def digest(self, secret: str) -> str:
        """
        Считает SHA-256 от plaintext'а и возвращает hex-строку.

        Args:
            secret: Plaintext в открытом виде

        Returns:
            64-символьная hex-строка SHA-256-дайджеста
        """
        return hashlib.sha256(secret.encode()).hexdigest()
