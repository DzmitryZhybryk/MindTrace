from dataclasses import dataclass

__all__ = ["CurrentUserResult"]


@dataclass(frozen=True, slots=True)
class CurrentUserResult:
    username: str
    email: str
    display_name: str | None
