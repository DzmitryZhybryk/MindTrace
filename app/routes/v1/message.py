import structlog
from fastapi import APIRouter

router = APIRouter()
logger = structlog.get_logger(__name__)


@router.get("/")
def get_message():
    logger.info("Получен запрос на создание сообщения", endpoint="/v1/messages/")
    return {"message": "Message created"}
