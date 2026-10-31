"""Пины семьи хранилища: лист берёт категорию и код из категорийной базы, маркер семьи остаётся общим предком."""

import pytest

from app.media.exceptions import ObjectStorageError, ObjectStoragePersistentError, ObjectStorageTemporaryError
from app.shared.exceptions import BaseDomainError, ErrorCategoryEnum, InternalError, TemporaryError


@pytest.mark.parametrize(
    ("error_class", "category_base", "expected_category", "expected_code"),
    [
        (ObjectStorageTemporaryError, TemporaryError, ErrorCategoryEnum.TEMPORARY, "temporary"),
        (
            ObjectStoragePersistentError,
            InternalError,
            ErrorCategoryEnum.INTERNAL,
            "media.object_storage_persistent_error",
        ),
    ],
)
def test_object_storage_error_leaf_takes_category_from_its_base(
    error_class: type[ObjectStorageError],
    category_base: type[BaseDomainError],
    expected_category: ErrorCategoryEnum,
    expected_code: str,
) -> None:
    """Лист — и семья ``ObjectStorageError``, и категорийная база; категория и код приходят от базы."""
    error = error_class(details={"key": "u1/f1/original.jpg"})

    assert isinstance(error, ObjectStorageError)
    assert isinstance(error, category_base)
    assert error.category is expected_category
    assert error.code == expected_code
    assert error.details == {"key": "u1/f1/original.jpg"}
