from pydantic import BaseModel, EmailStr

__all__ = [
    "UserCreateDTO",
]


class UserCreateDTO(BaseModel):
    username: str
    email: EmailStr
    password: str
