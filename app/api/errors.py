from __future__ import annotations

from typing import Any

from fastapi import HTTPException


class GoldAPIError(Exception):
    """Erro tratado da API Gold com código e payload estruturado."""

    def __init__(
        self,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
        *,
        status_code: int = 400,
    ) -> None:
        self.code = code
        self.message = message
        self.details = details or {}
        self.status_code = status_code
        super().__init__(message)

    def to_payload(self) -> dict[str, Any]:
        return {
            "error": {
                "code": self.code,
                "message": self.message,
                "details": self.details,
            }
        }


def raise_gold_api_error(
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
    *,
    status_code: int = 400,
) -> None:
    raise GoldAPIError(code, message, details, status_code=status_code)


def http_exception_from_value_error(error: ValueError) -> HTTPException:
    message = str(error)
    if "ano inválido" in message or "mes inválido" in message:
        raise GoldAPIError(
            "INVALID_COMPETENCIA",
            message,
            status_code=400,
        )
    raise GoldAPIError(
        "INVALID_COMPETENCIA",
        message,
        status_code=400,
    )
