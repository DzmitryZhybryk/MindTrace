from typing import Annotated

from pydantic import ConfigDict, Field

from app.shared.schemas import CamelModel


class CurrentUserResponse(CamelModel):
    model_config = ConfigDict(frozen=True)

    username: str
    email: str
    display_name: Annotated[str | None, Field(description="Отображаемое имя; null, если пользователь его не задал.")]
