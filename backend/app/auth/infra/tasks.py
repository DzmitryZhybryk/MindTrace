"""
Procrastinate-таски домена auth.

Локальный ``auth_blueprint`` коллекционирует декларации tasks этого домена
без зависимости от конкретного App-инстанса. Composition root собирает
blueprint'ы всех доменов и передаёт их в ``ProcrastinateComponent``,
который через ``add_tasks_from`` подключает их к App-инстансу.

EmailTransportPort достаётся из ``context.additional_context`` — словарь
наполняется на старте worker'а (см. Phase 6) — а не через module-level
синглтоны: воркер и API-процесс могут собирать registry по-разному.
"""

from procrastinate import Blueprint, JobContext, RetryStrategy

from app.auth.application.task_names import SEND_VERIFICATION_EMAIL_TASK
from app.auth.infra.email_renderer import render_verification_email
from app.shared.infra.email import EmailTransportPort
from app.shared.infra.http.exceptions import ExternalAPITemporaryError
from app.shared.logging import get_logger

auth_blueprint = Blueprint()

logger = get_logger(__name__)


@auth_blueprint.task(
    name=SEND_VERIFICATION_EMAIL_TASK,
    pass_context=True,
    retry=RetryStrategy(
        max_attempts=3,
        wait=10,
        exponential_wait=2,
        retry_exceptions={ExternalAPITemporaryError},
    ),
)
async def send_verification_email(
    context: JobContext,
    *,
    user_id: str,
    email: str,
    code: str,
) -> None:
    """
    Отправляет письмо с одноразовым кодом подтверждения email.

    Permanent-ошибки клиента (4xx, 500) падают сразу — retry не делается.
    Temporary (502/503/504, таймаут, сетевая ошибка) поднимают
    ``ExternalAPITemporaryError`` и попадают под retry-стратегию (3 попытки,
    экспоненциальный backoff от 10 сек).

    Args:
        context: Procrastinate JobContext с ``additional_context``, в котором
            worker должен предоставить ``email_transport: EmailTransportPort``
        user_id: ID пользователя; используется только для логов и lock'а
            (lock задаётся при defer'е в сервисе, не здесь)
        email: Адрес получателя
        code: Plaintext-код, который увидит пользователь в письме
    """
    transport: EmailTransportPort = context.additional_context["email_transport"]
    message = render_verification_email(email=email, code=code)
    await transport.send(message=message)
    logger.info("auth.verification_email.sent", user_id=user_id, email=email)
