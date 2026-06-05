from typing import Protocol

from app.shared.infra.email.schemas import EmailMessage


class EmailTransport(Protocol):
    """
    Абстракция отправки письма.

    Доменный код зависит только от этого Protocol; конкретный провайдер
    реализуется отдельным классом и регистрируется в ComponentRegistry
    под ключом ``EmailTransport``.
    """

    async def send(self, *, message: EmailMessage) -> None: ...
