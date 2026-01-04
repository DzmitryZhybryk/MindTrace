from app.auth.infra import AuthUnitOfWork


class AuthService:
    def __init__(self, uow: AuthUnitOfWork):
        self.uow = uow
