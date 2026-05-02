from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.auth.application.schemas import ClientMetadata, Registration
from app.auth.application.services import AuthService
from app.auth.presentation.cookies import set_refresh_token_cookie
from app.auth.presentation.dependencies import auth_service_dependency, client_metadata_dependency
from app.auth.presentation.responses import REGISTER_RESPONSES
from app.auth.presentation.schemas import RegisterRequest, TokenResponse

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
