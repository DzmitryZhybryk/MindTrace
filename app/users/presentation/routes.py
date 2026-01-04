from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.users.application.schemas import UserCreateDTO
from app.users.application.services import UserService
from app.users.presentation.dependencies import user_service_dependency
from app.users.presentation.responses import REGISTER_USER_RESPONSES
from app.users.presentation.schemas import RegisterUserRequest

router = APIRouter()


@router.post(
    "/register/",
    status_code=status.HTTP_201_CREATED,
    responses=REGISTER_USER_RESPONSES,
)
async def register_user(
    request: RegisterUserRequest,
    user_service: Annotated[UserService, Depends(user_service_dependency)],
):
    """Роут регистрации пользователя. Использует AuthService для создания пользователя."""
    user = UserCreateDTO(
        username=request.username,
        email=request.email,
        password=request.password,
    )
    await user_service.create_user(user=user)
    return {"message": "User registered"}
