"""Пины HTTP-семьи: лист берёт категорию и код из категорийной базы, маркер семьи остаётся общим предком."""

import pytest

from app.shared.exceptions import BaseDomainError, ErrorCategoryEnum, InternalError, UnavailableError
from app.shared.infra.http.exceptions import ExternalAPIError, ExternalAPIPersistentError, ExternalAPITemporaryError


@pytest.mark.parametrize(
    ("error_class", "category_base", "expected_category", "expected_code"),
    [
        (ExternalAPITemporaryError, UnavailableError, ErrorCategoryEnum.UNAVAILABLE, "unavailable"),
        (ExternalAPIPersistentError, InternalError, ErrorCategoryEnum.INTERNAL, "external_api_error"),
    ],
)
def test_external_api_error_leaf_takes_category_from_its_base(
    error_class: type[ExternalAPIError],
    category_base: type[BaseDomainError],
    expected_category: ErrorCategoryEnum,
    expected_code: str,
) -> None:
    """Лист — и семья ``ExternalAPIError``, и категорийная база; категория и код от базы, контекст вызова на месте."""
    error = error_class(
        method="POST",
        url="https://api.example.test/emails",
        status=503,
        message="upstream said no",
        body={"error": "no"},
    )

    assert isinstance(error, ExternalAPIError)
    assert isinstance(error, category_base)
    assert error.category is expected_category
    assert error.code == expected_code
    assert error.message == "upstream said no"
    assert (error.method, error.url, error.status, error.body) == (
        "POST",
        "https://api.example.test/emails",
        503,
        {"error": "no"},
    )
