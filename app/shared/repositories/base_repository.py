from typing import Any
from uuid import UUID

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.shared.models.base_model import Base


class BaseDBRepository[ModelT: Base]:
    def __init__(self, session: AsyncSession, model: type[ModelT]) -> None:
        self._session = session
        self.model = model

    async def _fetch_one(self, query: Select[tuple[ModelT]]) -> ModelT | None:
        result = await self._session.execute(query)
        return result.scalar_one_or_none()

    async def get_by_id(self, idx: int | UUID) -> ModelT | None:
        select_query = select(self.model).where(self.model.id == idx)
        return await self._fetch_one(select_query)

    async def create(self, data: dict[str, Any], return_model: bool = False) -> ModelT | None:
        new_obj = self.model(**data)
        self._session.add(new_obj)
        await self._session.commit()
        return new_obj if return_model else None
