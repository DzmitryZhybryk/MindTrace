"""
Фикстуры infra-слоя auth: фейк email-транспорта и ``JobContext`` для тестов procrastinate-тасок.

``job_context`` собирает реальный ``JobContext`` с фейк-транспортом в ``additional_context`` —
ровно так, как его наполняет worker на старте (см. ``send_verification_email``). ``App`` строится
поверх ``InMemoryConnector`` (без сети), ``Job`` — минимально валидный: таска читает только
``additional_context``, остальные поля контекста ей не нужны.
"""

import pytest
from procrastinate import App, JobContext
from procrastinate.jobs import Job
from procrastinate.testing import InMemoryConnector

from app.auth.application.task_names import SEND_VERIFICATION_EMAIL_TASK
from tests.fakes import FakeEmailTransport


@pytest.fixture
def fake_email_transport() -> FakeEmailTransport:
    return FakeEmailTransport()


@pytest.fixture
def job_context(fake_email_transport: FakeEmailTransport) -> JobContext:
    app = App(connector=InMemoryConnector())
    job = Job(
        queue="default",
        lock=None,
        queueing_lock=None,
        task_name=SEND_VERIFICATION_EMAIL_TASK,
        task_kwargs={},
    )
    return JobContext(
        app=app,
        job=job,
        start_timestamp=0.0,
        abort_reason=lambda: None,
        additional_context={"email_transport": fake_email_transport},
    )
