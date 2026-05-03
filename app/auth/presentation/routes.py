from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.auth.application.schemas import ClientMetadata, Login, Registration
from app.auth.application.services import AuthService
from app.auth.exceptions import InvalidRefreshTokenError
from app.auth.presentation.cookies import RefreshTokenCookie, clear_refresh_token_cookie, set_refresh_token_cookie
from app.auth.presentation.dependencies import auth_service_dependency, client_metadata_dependency
from app.auth.presentation.responses import LOGIN_RESPONSES, LOGOUT_RESPONSES, REFRESH_RESPONSES, REGISTER_RESPONSES
from app.auth.presentation.schemas import LoginRequest, RegisterRequest, TokenResponse

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
    registration = Registration.model_validate(body, from_attributes=True)
    token_pair = await auth_service.register(registration=registration, client_metadata=client_metadata)
    set_refresh_token_cookie(response=response, token_pair=token_pair)
    return TokenResponse(access_token=token_pair.access_token.get_secret_value())


@auth_router.post(
    "/login/",
    status_code=status.HTTP_200_OK,
    response_model=TokenResponse,
    responses=LOGIN_RESPONSES,
)
async def login(
    response: Response,
    body: LoginRequest,
    client_metadata: Annotated[ClientMetadata, Depends(client_metadata_dependency)],
    auth_service: Annotated[AuthService, Depends(auth_service_dependency)],
) -> TokenResponse:
    credentials = Login.model_validate(body, from_attributes=True)
    token_pair = await auth_service.login(credentials=credentials, client_metadata=client_metadata)
    set_refresh_token_cookie(response=response, token_pair=token_pair)
    return TokenResponse(access_token=token_pair.access_token.get_secret_value())


@auth_router.post(
    "/logout/",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=LOGOUT_RESPONSES,
)
async def logout(
    response: Response,
    auth_service: Annotated[AuthService, Depends(auth_service_dependency)],
    refresh_token_id: RefreshTokenCookie = None,
) -> None:
    if refresh_token_id is not None:
        await auth_service.logout(refresh_token_id=refresh_token_id)

    clear_refresh_token_cookie(response=response)


@auth_router.post(
    "/refresh/",
    status_code=status.HTTP_200_OK,
    response_model=TokenResponse,
    responses=REFRESH_RESPONSES,
)
async def refresh(
    response: Response,
    client_metadata: Annotated[ClientMetadata, Depends(client_metadata_dependency)],
    auth_service: Annotated[AuthService, Depends(auth_service_dependency)],
    refresh_token_id: RefreshTokenCookie = None,
) -> TokenResponse:
    if refresh_token_id is None:
        raise InvalidRefreshTokenError()

    token_pair = await auth_service.refresh(refresh_token_id=refresh_token_id, client_metadata=client_metadata)
    set_refresh_token_cookie(response=response, token_pair=token_pair)
    return TokenResponse(access_token=token_pair.access_token.get_secret_value())
