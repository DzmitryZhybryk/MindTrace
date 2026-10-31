import pytest
from procrastinate import JobContext

from app.auth.infra.tasks import send_verification_email
from app.shared.exceptions import InternalError, UnavailableError
from tests.fakes import FakeEmailTransport


async def test_send_verification_email_renders_and_sends(
    job_context: JobContext,
    fake_email_transport: FakeEmailTransport,
) -> None:
    """send_verification_email рендерит письмо и отдаёт транспорту: to=email, код в html и text."""
    await send_verification_email(job_context, user_id="user-1", email="user@example.com", code="123456")

    assert len(fake_email_transport.sent) == 1
    message = fake_email_transport.sent[0]
    assert message.to == "user@example.com"
    assert message.subject
    assert "123456" in message.html
    assert "123456" in message.text


@pytest.mark.parametrize("error", [UnavailableError(), InternalError()], ids=["unavailable", "internal"])
async def test_send_verification_email_propagates_transport_error(
    job_context: JobContext,
    fake_email_transport: FakeEmailTransport,
    error: Exception,
) -> None:
    """Сбой транспорта любой классификации пробрасывается, не глотается; письмо не отправлено."""
    fake_email_transport.error = error

    with pytest.raises(type(error)):
        await send_verification_email(job_context, user_id="user-1", email="user@example.com", code="123456")

    assert fake_email_transport.sent == []


@pytest.mark.parametrize(
    ("error", "is_retried"),
    [(UnavailableError(), True), (InternalError(), False)],
    ids=["unavailable", "internal"],
)
def test_send_verification_email_retries_only_temporary_failures(
    job_context: JobContext,
    error: Exception,
    is_retried: bool,
) -> None:
    """Стратегия задачи повторяет любой ``UnavailableError`` и не повторяет постоянный сбой."""
    retry = send_verification_email.get_retry_exception(exception=error, job=job_context.job)

    assert (retry is not None) is is_retried
