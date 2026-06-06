"""Фейк ``EmailVerificationService`` для тестов ``AuthService`` — записывает запросы верификации."""

from uuid import UUID

from app.auth.application.email_verification_service import EmailVerificationService


class FakeEmailVerificationService(EmailVerificationService):
    """
    Подменяет реальный ``EmailVerificationService`` в тестах ``AuthService``.

    ``__init__`` без зависимостей; ``request_email_verification`` лишь записывает
    ``user_id`` в ``requested_user_ids`` — register-флоу проверяет, что верификация
    была запрошена, не дёргая настоящий сервис.
    """

    def __init__(self) -> None:
        self.requested_user_ids: list[UUID] = []

    async def request_email_verification(self, user_id: UUID) -> None:
        self.requested_user_ids.append(user_id)
