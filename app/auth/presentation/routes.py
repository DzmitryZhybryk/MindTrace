from typing import Annotated

from fastapi import APIRouter, Depends

from app.auth.application.services import AuthService
from app.dependencies import auth_service_dependency

router = APIRouter()


@router.post("/register/")
async def register_user(
    service: Annotated[AuthService, Depends(auth_service_dependency)],
):
    return {"message": "User registered"}
