"""Фейк ``SaltedHasherPort`` без argon2 — детерминированный и быстрый."""

from app.shared.infra.crypto import SaltedHasherPort


class FakeSaltedHasher(SaltedHasherPort):
    """Детерминированный фейк: ``hash(secret) == f"hashed::{secret}"``, ``verify`` сравнивает с ним."""

    def hash(self, secret: str) -> str:
        return f"hashed::{secret}"

    def verify(self, secret: str, hashed: str) -> bool:
        return hashed == f"hashed::{secret}"
