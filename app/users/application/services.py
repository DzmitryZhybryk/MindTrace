from app.users.application.schemas import UserCreateDTO
from app.users.infra.user_uow import UserUnitOfWork


class UserService:
    def __init__(self, uow: UserUnitOfWork):
        self.uow = uow

    async def create_user(self, user: UserCreateDTO):
        pass
