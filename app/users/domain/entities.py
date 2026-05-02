import datetime as dt
from typing import Self
from uuid import UUID

from app.shared.domain.domain_mixins import TimestampedEntityMixin


class UserEntity(TimestampedEntityMixin):
    def __init__(
        self,
        user_id: UUID,
        username: str,
        email: str,
        terms_accepted_at: dt.datetime,
        marketing_emails_consent: bool,
        display_name: str | None = None,
        email_verified_at: dt.datetime | None = None,
        **timestamp_kwargs: dt.datetime | None,
    ) -> None:
        super().__init__(**timestamp_kwargs)
        self.user_id = user_id
        self.username = username
        self.email = email
        self.terms_accepted_at = terms_accepted_at
        self.marketing_emails_consent = marketing_emails_consent
        self.display_name = display_name
        self.email_verified_at = email_verified_at

    @classmethod
    def create_new_user_entity(
        cls,
        user_id: UUID,
        username: str,
        email: str,
        marketing_emails_consent: bool,
        terms_accepted_at: dt.datetime,
    ) -> Self:
        return cls(
            user_id=user_id,
            username=username,
            email=email,
            terms_accepted_at=terms_accepted_at,
            marketing_emails_consent=marketing_emails_consent,
        )
