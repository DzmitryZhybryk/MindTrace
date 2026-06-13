from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.application.ports import ChallengeRepositoryPort
from app.auth.domain.entities import ChallengeEntity
from app.auth.domain.enums import ChallengeType
from app.auth.infra.models import Challenge
from app.shared.repositories.base_repository import BaseDBRepository
from app.shared.types import DictStrAny


class ChallengeRepository(BaseDBRepository[Challenge], ChallengeRepositoryPort):
    def __init__(self, session: AsyncSession) -> None:
        """
        Инициализирует репозиторий challenge'ей.

        Args:
            session: Асинхронная SQLAlchemy-сессия, привязанная к UnitOfWork
        """
        super().__init__(session=session, model=Challenge)

    async def insert_challenge(self, challenge: ChallengeEntity) -> None:
        """
        Добавляет challenge в сессию без коммита.

        Запись становится видимой другим транзакциям только после ``commit()``
        в UnitOfWork. Композитный партиальный unique-индекс по
        ``(user_id, challenge_type) WHERE used_at IS NULL`` гарантирует, что в
        один момент у пользователя может быть не более одного активного
        challenge'а конкретного типа — конфликт всплывёт ``IntegrityError``
        на flush.

        Args:
            challenge: Доменная сущность challenge'а
        """
        await self.insert(data=Challenge(**self._to_columns(entity=challenge)))

    async def find_active_challenge_for_update(
        self,
        user_id: UUID,
        challenge_type: ChallengeType,
    ) -> ChallengeEntity | None:
        """
        Находит активный challenge заданного типа и блокирует строку до конца транзакции.

        ``SELECT ... FOR UPDATE`` нужен для verify-флоу: гарантирует, что
        параллельные запросы на ввод кода сериализуются и не дают потерять
        increment счётчика попыток (read-modify-write race под READ COMMITTED).

        Args:
            user_id: ID пользователя
            challenge_type: Тип challenge'а — ограничивает выборку одним сценарием

        Returns:
            Доменная сущность challenge'а либо ``None``, если активного нет
        """
        query = (
            sa.select(Challenge)
            .where(
                Challenge.user_id == user_id,
                Challenge.challenge_type == challenge_type.value,
                Challenge.used_at.is_(None),
            )
            .with_for_update()
        )
        model = await self._fetch_one(query=query)
        return self._to_entity(model=model) if model else None

    async def update_challenge_by_id(self, challenge: ChallengeEntity) -> None:
        """
        Персистит изменённое состояние challenge'а через atomic UPDATE по PK.

        Все non-PK-поля переписываются текущим состоянием entity. Под ранее взятым
        ``FOR UPDATE``-локом параллельные апдейты сериализованы.

        Args:
            challenge: Доменная сущность с уже обновлённым состоянием
        """
        values = self._to_columns(entity=challenge)
        del values["id"]  # PK не входит в SET
        query = sa.update(Challenge).where(Challenge.id == challenge.challenge_id).values(**values)
        await self._session.execute(query)

    def _to_columns(self, entity: ChallengeEntity) -> DictStrAny:
        """
        Единый маппинг entity → колонки ORM-модели (включая PK ``id``).

        Источник истины для обоих путей записи: INSERT (``Challenge(**columns)``)
        и UPDATE (те же колонки минус PK). Новое поле добавляется здесь один раз —
        и попадает и в INSERT, и в UPDATE, рассинхрон между ними невозможен.

        Args:
            entity: Доменная сущность challenge'а

        Returns:
            Словарь ``column -> value`` со всеми колонками, включая PK
        """
        return {
            "id": entity.challenge_id,
            "user_id": entity.user_id,
            "challenge_type": entity.challenge_type.value,
            "code_hash": entity.code_hash,
            "expires_at": entity.expires_at,
            "attempts": entity.attempts,
            "used_at": entity.used_at,
            "created_at": entity.created_at,
            "updated_at": entity.updated_at,
            "deleted_at": entity.deleted_at,
        }

    def _to_entity(self, model: Challenge) -> ChallengeEntity:
        """
        Конвертирует ORM-модель в доменную сущность.

        Args:
            model: ORM-модель из БД

        Returns:
            Доменная сущность challenge'а
        """
        return ChallengeEntity(
            challenge_id=model.id,
            user_id=model.user_id,
            challenge_type=ChallengeType(model.challenge_type),
            code_hash=model.code_hash,
            expires_at=model.expires_at,
            attempts=model.attempts,
            used_at=model.used_at,
            created_at=model.created_at,
            updated_at=model.updated_at,
            deleted_at=model.deleted_at,
        )
