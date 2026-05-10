from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status

from app.auth.application.schemas import ClientMetadata, RegistrationCommand
from app.auth.application.services import AuthService
from app.auth.presentation.cookies import set_refresh_token_cookie
from app.auth.presentation.dependencies import (
    auth_service_dependency,
    client_metadata_dependency,
    current_user_id_dependency,
)
from app.auth.presentation.responses import (
    REGISTER_RESPONSES,
    SEND_EMAIL_VERIFICATION_RESPONSES,
    VERIFY_EMAIL_RESPONSES,
)
from app.auth.presentation.schemas import RegisterRequest, TokenResponse, VerifyEmailRequest

auth_router = APIRouter()


@auth_router.post(
    "/register/",
    status_code=status.HTTP_201_CREATED,
    response_model=TokenResponse,
    responses=REGISTER_RESPONSES,
)
async def register(
    response: Response,
    body: RegisterRequest,
    client_metadata: Annotated[ClientMetadata, Depends(client_metadata_dependency)],
    auth_service: Annotated[AuthService, Depends(auth_service_dependency)],
) -> TokenResponse:
    registration = RegistrationCommand.model_validate(body, from_attributes=True)
    token_pair = await auth_service.register(registration=registration, client_metadata=client_metadata)
    set_refresh_token_cookie(response=response, token_pair=token_pair)
    return TokenResponse(access_token=token_pair.access_token.get_secret_value())


@auth_router.post(
    "/email/send-verification/",
    status_code=status.HTTP_202_ACCEPTED,
    responses=SEND_EMAIL_VERIFICATION_RESPONSES,
)
async def send_email_verification(
    user_id: Annotated[UUID, Depends(current_user_id_dependency)],
    auth_service: Annotated[AuthService, Depends(auth_service_dependency)],
) -> None:
    await auth_service.request_email_verification(user_id=user_id)


@auth_router.post(
    "/email/verify/",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=VERIFY_EMAIL_RESPONSES,
)
async def verify_email(
    body: VerifyEmailRequest,
    user_id: Annotated[UUID, Depends(current_user_id_dependency)],
    auth_service: Annotated[AuthService, Depends(auth_service_dependency)],
) -> None:
    await auth_service.verify_email(user_id=user_id, code=body.code)
