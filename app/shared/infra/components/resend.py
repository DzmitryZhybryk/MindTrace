"""
ResendComponent — lifecycle обёртка над ResendClient.

Создаёт инстанс клиента из настроек, регистрирует в registry под ключом
EmailTransport (доменный код зависит только от Protocol, не от конкретного
провайдера). На shutdown закрывает httpx-пул.
"""

from app.shared.infra.clients.config import HTTPClientConfig
from app.shared.infra.clients.email import EmailTransport, ResendClient
from app.shared.infra.components.base import BaseComponent
from app.shared.infra.components.registry import ComponentRegistry
from app.shared.settings import ResendSettings


class ResendComponent(BaseComponent):
    def __init__(self, settings: ResendSettings) -> None:
        self._client = ResendClient(
            config=HTTPClientConfig(
                base_url=settings.RESEND_BASE_URL,
                timeout=settings.RESEND_TIMEOUT_SECONDS,
                headers={
                    "Authorization": f"Bearer {settings.RESEND_API_KEY.get_secret_value()}",
                    "Content-Type": "application/json",
                },
            ),
            default_from=settings.RESEND_FROM_EMAIL,
        )

    async def startup(self, registry: ComponentRegistry) -> None:
        registry.set(EmailTransport, self._client)

    async def shutdown(self) -> None:
        await self._client.aclose()
