from typing import Protocol

from app.shared.infra.email.schemas import EmailMessage


class EmailTransportPort(Protocol):
    """
    Абстракция отправки письма.

    Доменный код зависит только от этого Protocol; конкретный провайдер
    реализуется отдельным классом и регистрируется в ComponentRegistry
    под ключом ``EmailTransportPort``.
    """

    async def send(self, *, message: EmailMessage) -> None:
        """
        Отправляет письмо.

        Scenarios:
            - фоновая задача, которая шлёт письмо

        Args:
            message: Готовое письмо с отрендеренным телом

        Raises:
            UnavailableError: временный сбой провайдера, повтор может помочь
            InternalError: постоянный сбой провайдера, повтор того же письма не поможет
        """
        ...
