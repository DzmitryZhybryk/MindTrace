from typing import Annotated

from pydantic import Field

from app.shared.schemas import CamelModel


class CurrentUserResponse(CamelModel):
    username: str
    email: str
    display_name: Annotated[str | None, Field(description="Отображаемое имя; null, если пользователь его не задал.")]
