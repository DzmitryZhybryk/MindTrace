"""
Cross-доменные фикстуры **уровня unit**.

Живут здесь, а не в корневом ``tests/conftest.py`` и не в conftest конкретного
домена, потому что:

- нужны более чем одному домену (``jwt_service`` потребляют и auth —
  ``token_issuer``/``auth_service``, и shared — тест самого ``JWTService``), а
  pytest резолвит фикстуры только вверх по дереву → нужен общий предок;
- но специфичны именно для unit: ``JWTService`` строится с **явным** тестовым
  секретом в обход ``settings`` (философия unit — конфиг из конструктора, а не из
  синглтона). api-тесты так переиспользовать его не смогут — приложение декодит
  секретом из ``settings``, поэтому им нужна своя согласованная с settings проводка.

Корневой ``tests/conftest.py`` импортируется pytest'ом раньше дочерних, поэтому
здесь ``app`` импортируется обычным top-level импортом — env-bootstrap уже отработал.
``jwt_secret``/``jwt_algorithm`` отданы рядом, чтобы тесты, собирающие «сырой» токен
вручную (истёкший, с кривым ``sub``), брали тот же секрет, что и ``jwt_service`` —
один источник истины, без рассинхрона литералов.
"""

import pytest

from app.shared.infra.jwt import JWTService

_JWT_SECRET = "unit-test-secret-at-least-32-bytes-long"
_JWT_ALGORITHM = "HS256"
_ACCESS_TOKEN_EXPIRE_MINUTES = 15


@pytest.fixture
def jwt_secret() -> str:
    return _JWT_SECRET


@pytest.fixture
def jwt_algorithm() -> str:
    return _JWT_ALGORITHM


@pytest.fixture
def jwt_service() -> JWTService:
    return JWTService(
        secret=_JWT_SECRET,
        algorithm=_JWT_ALGORITHM,
        access_token_expire_minutes=_ACCESS_TOKEN_EXPIRE_MINUTES,
    )
