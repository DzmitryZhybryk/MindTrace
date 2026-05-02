import datetime as dt
from uuid import UUID

import jwt


class JWTService:
    def __init__(self, secret: str, algorithm: str, access_token_expire_minutes: int) -> None:
        self._secret = secret
        self._algorithm = algorithm
        self._expire_minutes = access_token_expire_minutes

    def create_access_token(self, user_id: UUID, role: str) -> str:
        now = dt.datetime.now(tz=dt.UTC)
        payload = {
            "sub": str(user_id),
            "role": role,
            "iat": now,
            "exp": now + dt.timedelta(minutes=self._expire_minutes),
        }
        return jwt.encode(payload, self._secret, algorithm=self._algorithm)
