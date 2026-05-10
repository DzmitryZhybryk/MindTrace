import datetime as dt
from typing import Self
from uuid import UUID, uuid4

from app.auth.domain.enums import UserRole
from app.auth.domain.value_objects import Password
from app.auth.exceptions import EmailAlreadyVerifiedError
from app.shared.domain.domain_mixins import TimestampedEntityMixin


class UserCredentialsEntity(TimestampedEntityMixin):
    def __init__(
        self,
        user_id: UUID,
        email: str,
        username: str,
        password: Password,
        role: UserRole,
        email_verified_at: dt.datetime | None = None,
        **timestamp_kwargs: dt.datetime | None,
    ) -> None:
        super().__init__(**timestamp_kwargs)
        self.user_id = user_id
        self.email = email
        self.username = username
        self.password = password
        self.role = role
        self.email_verified_at = email_verified_at

    @classmethod
    def create(
        cls,
        email: str,
        username: str,
        password: Password,
        role: UserRole = UserRole.FREE,
    ) -> Self:
        return cls(
            user_id=uuid4(),
            email=email,
            username=username,
            password=password,
            role=role,
        )

    @property
    def is_email_verified(self) -> bool:
        """Признак того, что email пользователя подтверждён."""
        return self.email_verified_at is not None

    def ensure_not_verified(self) -> None:
        """
        Проверяет, что email ещё не подтверждён.

        Используется как прекондиция всех use case'ов, инициирующих верификацию
        (запрос нового кода, ввод кода): нельзя начать процесс на уже
        подтверждённом email.

        Raises:
            EmailAlreadyVerifiedError: Email уже подтверждён
        """
        if self.is_email_verified:
            raise EmailAlreadyVerifiedError()

    def mark_email_verified(self) -> None:
        """
        Помечает email пользователя как подтверждённый.

        Идемпотентно: повторный вызов перезапишет timestamp, но содержательно
        ничего не меняет.
        """
        self.email_verified_at = dt.datetime.now(tz=dt.UTC)
        self._mark_updated()
