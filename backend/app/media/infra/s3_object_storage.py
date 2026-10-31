import datetime as dt
from collections.abc import Collection
from http import HTTPStatus
from itertools import batched
from typing import TYPE_CHECKING, ClassVar

from aiohttp import ClientError as AiohttpClientError
from botocore.exceptions import BotoCoreError, ClientError, IncompleteReadError
from botocore.exceptions import ConnectionError as BotocoreConnectionError
from botocore.exceptions import HTTPClientError as BotocoreHTTPClientError

from app.media.application.ports.private_storage import ObjectInfo, PrivateStoragePort, SignedUpload
from app.media.application.ports.public_storage import PublicStoragePort
from app.media.exceptions import (
    ObjectNotFoundError,
    ObjectStoragePersistentError,
    ObjectStorageTemporaryError,
    ObjectTooLargeError,
)

if TYPE_CHECKING:
    from types_aiobotocore_s3 import S3Client


class S3ObjectStorage(PrivateStoragePort, PublicStoragePort):
    """
    Один бакет S3-совместимого хранилища.

    Реализует порты и приватного, и публичного бакета: какой из них видит сервис, решает сборка.
    """

    _DELETE_OBJECTS_MAX_KEYS: ClassVar[int] = 1000

    def __init__(self, *, client: S3Client, bucket: str) -> None:
        self._client = client
        self._bucket = bucket

    async def sign_upload(
        self,
        *,
        key: str,
        content_type: str,
        size_bytes: int,
        expires_in: dt.timedelta,
    ) -> SignedUpload:
        signed_at = dt.datetime.now(dt.UTC)
        required_headers = _signed_upload_headers(content_type=content_type)
        try:
            url = await self._client.generate_presigned_url(
                ClientMethod="put_object",
                Params={
                    "Bucket": self._bucket,
                    "Key": key,
                    "ContentType": required_headers["Content-Type"],
                    "ContentLength": size_bytes,
                    "IfNoneMatch": required_headers["If-None-Match"],
                },
                ExpiresIn=int(expires_in.total_seconds()),
            )
        except BotoCoreError as error:
            raise ObjectStoragePersistentError(details={"key": key}) from error

        return SignedUpload(
            url=url,
            expires_at=signed_at + expires_in,
            required_headers=tuple(required_headers.items()),
        )

    async def head_object(self, key: str) -> ObjectInfo | None:
        try:
            response = await self._client.head_object(Bucket=self._bucket, Key=key)
        except ClientError as error:
            if _is_not_found(error):
                return None

            error_class = ObjectStorageTemporaryError if _is_temporary_failure(error) else ObjectStoragePersistentError
            raise error_class(details={"key": key}) from error
        except (BotocoreConnectionError, BotocoreHTTPClientError) as error:
            raise ObjectStorageTemporaryError(details={"key": key}) from error
        except BotoCoreError as error:
            raise ObjectStoragePersistentError(details={"key": key}) from error

        return ObjectInfo(size_bytes=response["ContentLength"], content_type=response.get("ContentType"))

    async def get_object(self, *, key: str, max_bytes: int) -> bytes:
        try:
            response = await self._client.get_object(Bucket=self._bucket, Key=key)
        except ClientError as error:
            if _is_missing_key(error):
                raise ObjectNotFoundError(details={"key": key}) from error

            error_class = ObjectStorageTemporaryError if _is_temporary_failure(error) else ObjectStoragePersistentError
            raise error_class(details={"key": key}) from error
        except (BotocoreConnectionError, BotocoreHTTPClientError) as error:
            raise ObjectStorageTemporaryError(details={"key": key}) from error
        except BotoCoreError as error:
            raise ObjectStoragePersistentError(details={"key": key}) from error

        async with response["Body"] as body:
            if response["ContentLength"] > max_bytes:
                raise ObjectTooLargeError(details={"key": key, "max_bytes": max_bytes})

            try:
                return await body.read()
            # Обрыв тела aiobotocore не переводит в ошибку botocore — приходит исключение aiohttp.
            except (BotocoreHTTPClientError, IncompleteReadError, AiohttpClientError) as error:
                raise ObjectStorageTemporaryError(details={"key": key}) from error

    async def put_object(self, *, key: str, body: bytes, content_type: str, cache_control: str) -> None:
        try:
            await self._client.put_object(
                Bucket=self._bucket,
                Key=key,
                Body=body,
                ContentType=content_type,
                CacheControl=cache_control,
            )
        except ClientError as error:
            error_class = ObjectStorageTemporaryError if _is_temporary_failure(error) else ObjectStoragePersistentError
            raise error_class(details={"key": key}) from error
        except (BotocoreConnectionError, BotocoreHTTPClientError) as error:
            raise ObjectStorageTemporaryError(details={"key": key}) from error
        except BotoCoreError as error:
            raise ObjectStoragePersistentError(details={"key": key}) from error

    async def delete_objects(self, keys: Collection[str]) -> None:
        for batch in batched(iterable=keys, n=self._DELETE_OBJECTS_MAX_KEYS):
            try:
                response = await self._client.delete_objects(
                    Bucket=self._bucket,
                    Delete={"Objects": [{"Key": key} for key in batch], "Quiet": True},
                )
            except ClientError as error:
                error_class = (
                    ObjectStorageTemporaryError if _is_temporary_failure(error) else ObjectStoragePersistentError
                )
                raise error_class(details={"keys": batch}) from error
            except (BotocoreConnectionError, BotocoreHTTPClientError) as error:
                raise ObjectStorageTemporaryError(details={"keys": batch}) from error
            except BotoCoreError as error:
                raise ObjectStoragePersistentError(details={"keys": batch}) from error

            # Отказ по отдельным ключам приходит в теле ответа 200, без HTTP-статуса: классифицировать его
            # можно только по кодам, и временным он считается, лишь когда временны все коды.
            failed_keys = {error.get("Key"): error.get("Code") for error in response.get("Errors", ())}
            if failed_keys:
                is_temporary = all(code in _TEMPORARY_KEY_ERROR_CODES for code in failed_keys.values())
                error_class = ObjectStorageTemporaryError if is_temporary else ObjectStoragePersistentError
                raise error_class(details={"failed_keys": failed_keys})


def _signed_upload_headers(*, content_type: str) -> dict[str, str]:
    return {"Content-Type": content_type, "If-None-Match": "*"}


# 404 приходит и на пропавший бакет. GET отличает его по коду ошибки, а у HEAD тела нет —
# там остаётся только статус, и пропавший бакет от пропавшего объекта неотличим.
def _is_not_found(error: ClientError) -> bool:
    return error.response.get("ResponseMetadata", {}).get("HTTPStatusCode") == HTTPStatus.NOT_FOUND


def _is_missing_key(error: ClientError) -> bool:
    return error.response.get("Error", {}).get("Code") == "NoSuchKey"


# Коды, которые botocore в standard mode повторяет сам (``botocore/retries/standard.py``): сюда они доходят
# с исчерпанными попытками и остаются временными, хотя статус у части из них 400.
_TEMPORARY_ERROR_CODES: frozenset[str] = frozenset(
    {
        "RequestTimeout",
        "RequestTimeoutException",
        "PriorRequestNotComplete",
        "Throttling",
        "ThrottlingException",
        "ThrottledException",
        "RequestThrottledException",
        "RequestThrottled",
        "TooManyRequestsException",
        "ProvisionedThroughputExceededException",
        "TransactionInProgressException",
        "RequestLimitExceeded",
        "BandwidthLimitExceeded",
        "LimitExceededException",
        "SlowDown",
        "EC2ThrottledException",
    }
)


# У отказа по ключу нет статуса, поэтому коды серверных сбоев, которые у запроса узнаются по 5xx, перечислены явно.
_TEMPORARY_KEY_ERROR_CODES: frozenset[str] = _TEMPORARY_ERROR_CODES | {"InternalError", "ServiceUnavailable"}

_TEMPORARY_CLIENT_STATUSES: frozenset[int] = frozenset({HTTPStatus.REQUEST_TIMEOUT, HTTPStatus.TOO_MANY_REQUESTS})


def _is_temporary_failure(error: ClientError) -> bool:
    status = error.response.get("ResponseMetadata", {}).get("HTTPStatusCode", 0)
    if status >= HTTPStatus.INTERNAL_SERVER_ERROR or status in _TEMPORARY_CLIENT_STATUSES:
        return True

    return error.response.get("Error", {}).get("Code") in _TEMPORARY_ERROR_CODES
