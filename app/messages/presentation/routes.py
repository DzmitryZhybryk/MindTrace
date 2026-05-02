from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def get_message():
    return {"message": "Message created"}
