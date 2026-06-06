import datetime as dt
from uuid import uuid4

from app.users.domain.entities import UserEntity
from tests.builders import make_user_entity


def test_create_new_user_entity_sets_fields_and_defaults() -> None:
    """Фабрика `create_new_user_entity` проставляет переданные поля; display_name/deleted_at — None."""
    user_id = uuid4()
    terms_accepted_at = dt.datetime(2026, 1, 1, tzinfo=dt.UTC)

    entity = UserEntity.create_new_user_entity(
        user_id=user_id,
        username="alice",
        email="alice@example.com",
        marketing_emails_consent=True,
        terms_accepted_at=terms_accepted_at,
    )

    assert entity.user_id == user_id
    assert entity.username == "alice"
    assert entity.email == "alice@example.com"
    assert entity.marketing_emails_consent is True
    assert entity.terms_accepted_at == terms_accepted_at
    assert entity.display_name is None
    assert entity.deleted_at is None


def test_user_entity_accepts_explicit_display_name_and_timestamps() -> None:
    """Конструктор принимает display_name и явные timestamp'ы (created/updated/deleted)."""
    created_at = dt.datetime(2026, 1, 1, tzinfo=dt.UTC)
    updated_at = dt.datetime(2026, 1, 2, tzinfo=dt.UTC)
    deleted_at = dt.datetime(2026, 1, 3, tzinfo=dt.UTC)

    entity = make_user_entity(
        display_name="Alice",
        created_at=created_at,
        updated_at=updated_at,
        deleted_at=deleted_at,
    )

    assert entity.display_name == "Alice"
    assert entity.created_at == created_at
    assert entity.updated_at == updated_at
    assert entity.deleted_at == deleted_at
